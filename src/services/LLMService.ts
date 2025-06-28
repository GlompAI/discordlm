import { Client, Guild, Message } from "discord.js";
import { replaceAllAsync } from "../replace.ts";
import { GifReader } from "omggif";
import { PNG } from "pngjs";
import { Buffer } from "node:buffer";
import { CharacterCard } from "../CharacterCard.ts";
import adze from "adze";
import { MessageView } from "../types.ts";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { LLMProvider } from "../llm/provider.ts";
import { GeminiProvider } from "../llm/gemini.ts";
import { OpenAIProvider } from "../llm/openai.ts";
import { configService } from "./ConfigService.ts";

export class LLMService {
    private activeGenerations = 0;
    private llmProvider: LLMProvider;
    private fallbackProvider: LLMProvider | null = null;

    constructor() {
        this.llmProvider = this.createProvider();
        if (configService.getProvider() === "gemini") {
            this.fallbackProvider = new OpenAIProvider(configService.getModel("openai"));
        }
    }

    private createProvider(): LLMProvider {
        const provider = configService.getProvider();
        const model = configService.getModel(provider);
        switch (provider) {
            case "openai":
                return new OpenAIProvider(model);
            case "gemini":
                return new GeminiProvider(model);
            case "groq":
                return new OpenAIProvider(model);
            default:
                throw new Error(`Unknown LLM provider: ${provider}`);
        }
    }

    public setBotDiscordName(name: string) {
        this.llmProvider.setBotDiscordName(name);
    }

    public async generateMessage(
        client: Client,
        messages: Message[],
        charId: string,
        character: CharacterCard | null,
        _seed?: number,
        continuation: { user: string; prompt: string } | false = false,
        sanitize = false,
        isSFW = false,
    ) {
        this.activeGenerations++;
        try {
            async function convertSnowflake(userId: string, guild: Guild | null) {
                let returnString: string;
                if (guild) {
                    try {
                        const clientUser = await guild.members.fetch(userId);
                        returnString = clientUser.nickname ?? clientUser.displayName;
                    } catch {
                        try {
                            const clientUser = await client.users.fetch(userId);
                            returnString = clientUser.displayName;
                        } catch {
                            adze.error("An error occurred while trying to lookup some user.");
                        }
                        returnString = "Unknown User";
                    }
                } else {
                    const clientUser = await client.users.fetch(userId);
                    returnString = clientUser.displayName;
                }
                return returnString;
            }

            function getCharacterName(message: Message): string | null {
                if (message.webhookId && (message as Message).author?.username) {
                    return (message as Message).author.username;
                }
                if (message.author.bot && message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title) {
                        return embed.title;
                    }
                }
                return null;
            }

            const lastResetIndex = messages.map((m) => m.content).findLastIndex((c) =>
                c.includes(RESET_MESSAGE_CONTENT)
            );

            if (lastResetIndex !== -1) {
                messages = messages.slice(lastResetIndex + 1);
            }

            const historyPromises = messages.filter((m) => m.attachments || m.content || m.embeds.length > 0).map(
                async (message): Promise<MessageView | null> => {
                    let role: "user" | "assistant" | "system" = "user";
                    let userName = "";
                    let messageText = "";

                    const characterName = getCharacterName(message);

                    if (message.author.id === charId && !characterName) {
                        role = "assistant";
                        userName = "Assistant";
                        messageText = message.content;
                    } else if (characterName) {
                        userName = characterName;
                        role = ((character?.name === characterName) || (character?.char_name === characterName))
                            ? "assistant"
                            : "user";

                        if (message.embeds.length > 0 && message.embeds[0].description) {
                            messageText = message.embeds[0].description;
                        } else {
                            messageText = message.content;
                        }
                    } else {
                        role = "user";
                        userName = await convertSnowflake(message.author.id, message.guild);
                        messageText = sanitize ? message.cleanContent : message.content;
                    }

                    // Strip the attribution link from the message content
                    messageText = messageText.replace(
                        /\n\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/\d+>\)/,
                        "",
                    );

                    let finalMessageText = await replaceAllAsync(
                        messageText,
                        /<@(\d+)>/g,
                        async (_, snowflake) => `@${await convertSnowflake(snowflake, message.guild)}`,
                    );

                    finalMessageText = await replaceAllAsync(
                        finalMessageText,
                        /<@&(\d+)>/g,
                        async (_, snowflake) => {
                            if (message.guild) {
                                try {
                                    const role = await message.guild.roles.fetch(snowflake);
                                    return `@${role?.name ?? "Unknown Role"}`;
                                } catch {
                                    return "@Unknown Role";
                                }
                            }
                            return "@Unknown Role";
                        },
                    );

                    const mediaContent: { inlineData: { mimeType: string; data: string } }[] = [];

                    if (message.attachments.size > 0) {
                        const attachmentMedia = await Promise.all(
                            message.attachments
                                .map(async (a) => {
                                    if (
                                        !a.contentType?.startsWith("image/") &&
                                        !a.contentType?.startsWith("video/")
                                    ) {
                                        return null;
                                    }

                                    try {
                                        // Retry logic with exponential backoff
                                        let lastError;
                                        for (let attempt = 0; attempt < 3; attempt++) {
                                            try {
                                                const response = await fetch(a.url, {
                                                    headers: { "User-Agent": "DiscordLM-Bot/1.0" },
                                                });
                                                if (!response.ok) {
                                                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                                                }
                                                const buffer = await response.arrayBuffer();

                                                if (a.contentType === "image/gif") {
                                                    try {
                                                        const reader = new GifReader(Buffer.from(buffer));
                                                        const png = new PNG({
                                                            width: reader.width,
                                                            height: reader.height,
                                                        });
                                                        const frameData = Buffer.alloc(
                                                            reader.width * reader.height * 4,
                                                        );
                                                        reader.decodeAndBlitFrameRGBA(0, frameData);
                                                        png.data = frameData;
                                                        const pngBuffer = PNG.sync.write(png);
                                                        const base64 = pngBuffer.toString("base64");
                                                        return {
                                                            inlineData: {
                                                                mimeType: "image/png",
                                                                data: base64,
                                                            },
                                                        };
                                                    } catch (error) {
                                                        adze.error("Failed to process GIF attachment:", error);
                                                        return null;
                                                    }
                                                } else {
                                                    const base64 = Buffer.from(buffer).toString("base64");
                                                    return {
                                                        inlineData: {
                                                            mimeType: a.contentType!,
                                                            data: base64,
                                                        },
                                                    };
                                                }
                                            } catch (error) {
                                                lastError = error;
                                                if (attempt < 2) {
                                                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
                                                    adze.warn(
                                                        `Attempt ${
                                                            attempt + 1
                                                        } failed for attachment, retrying in ${delay}ms:`,
                                                        error,
                                                    );
                                                    await new Promise((resolve) => setTimeout(resolve, delay));
                                                }
                                            }
                                        }
                                        if (lastError) {
                                            throw lastError;
                                        }
                                    } catch (error) {
                                        adze.error(`Failed to fetch attachment from ${a.url} after 3 attempts:`, error);
                                        return null;
                                    }
                                }),
                        );
                        const filteredAttachmentMedia = attachmentMedia.filter((item) => item !== null) as {
                            inlineData: { mimeType: string; data: string };
                        }[];
                        mediaContent.push(...filteredAttachmentMedia);
                    }

                    if (message.stickers.size > 0) {
                        const sticker = message.stickers.first()!;
                        if (finalMessageText.trim() === "") {
                            finalMessageText = `[sticker: ${sticker.name}]`;
                        } else {
                            finalMessageText += ` [sticker: ${sticker.name}]`;
                        }
                        try {
                            // Retry logic for stickers
                            let lastError;
                            for (let attempt = 0; attempt < 3; attempt++) {
                                try {
                                    const response = await fetch(sticker.url, {
                                        headers: { "User-Agent": "DiscordLM-Bot/1.0" },
                                    });
                                    if (!response.ok) {
                                        throw new Error(`HTTP ${response.status} ${response.statusText}`);
                                    }
                                    const blob = await response.blob();
                                    const buffer = await blob.arrayBuffer();
                                    const base64 = Buffer.from(buffer).toString("base64");
                                    mediaContent.push({
                                        inlineData: {
                                            mimeType: "image/png",
                                            data: base64,
                                        },
                                    });
                                    lastError = undefined; // Clear error on success
                                    break; // Success, exit retry loop
                                } catch (error) {
                                    lastError = error;
                                    if (attempt < 2) {
                                        const delay = Math.pow(2, attempt) * 1000;
                                        adze.warn(
                                            `Attempt ${attempt + 1} failed for sticker, retrying in ${delay}ms:`,
                                            error,
                                        );
                                        await new Promise((resolve) => setTimeout(resolve, delay));
                                    }
                                }
                            }
                            if (lastError) {
                                adze.error(`Failed to fetch sticker ${sticker.url} after 3 attempts:`, lastError);
                            }
                        } catch (error) {
                            adze.error(`Failed to fetch sticker ${sticker.url} after 3 attempts:`, error);
                        }
                    }

                    const emojiRegex = /<a?:(\w+):(\d+)>/g;
                    const matches = [...finalMessageText.matchAll(emojiRegex)];
                    for (const match of matches) {
                        const _emojiName = match[1];
                        const emojiId = match[2];
                        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
                        finalMessageText = finalMessageText.replace(match[0], "");

                        try {
                            // Retry logic for emojis
                            let buffer;
                            let success = false;
                            for (let attempt = 0; attempt < 3; attempt++) {
                                try {
                                    const response = await fetch(emojiUrl, {
                                        headers: {
                                            "User-Agent": "DiscordLM-Bot/1.0",
                                            "Accept": "image/gif,image/png,image/webp,*/*",
                                        },
                                    });
                                    if (!response.ok) {
                                        throw new Error(`HTTP ${response.status} ${response.statusText}`);
                                    }
                                    buffer = await response.arrayBuffer();
                                    success = true;
                                    break;
                                } catch (error) {
                                    if (attempt < 2) {
                                        const delay = Math.pow(2, attempt) * 500; // 500ms, 1s
                                        adze.debug(`Attempt ${attempt + 1} failed for emoji, retrying in ${delay}ms`);
                                        await new Promise((resolve) => setTimeout(resolve, delay));
                                    } else {
                                        throw error;
                                    }
                                }
                            }

                            if (!success || !buffer) continue;

                            const base64 = Buffer.from(buffer).toString("base64");
                            mediaContent.push({
                                inlineData: {
                                    mimeType: "image/png",
                                    data: base64,
                                },
                            });
                        } catch (error) {
                            adze.error(`Failed to fetch emoji URL ${emojiUrl}:`, error);
                        }
                    }

                    return {
                        message: finalMessageText,
                        role,
                        messageId: message.id,
                        user: userName,
                        timestamp: message.createdAt.toISOString(),
                        mediaContent: mediaContent.length > 0 ? mediaContent : undefined,
                    };
                },
            );

            const resolvedHistory = await Promise.all(historyPromises);
            const history: MessageView[] = resolvedHistory.filter((item): item is MessageView => item != null);

            if (continuation) {
                history.push({
                    role: "user",
                    user: continuation.user,
                    message: continuation.prompt,
                    messageId: "",
                    timestamp: new Date().toISOString(),
                });
            }

            if (configService.getProvider() === "gemini" && this.fallbackProvider) {
                try {
                    const result = await this.llmProvider.generate(history, character ?? undefined, isSFW);
                    // Check for censorship
                    if (!result.text()) {
                        // This is a censorship case, do not fallback
                        return result;
                    }
                    return result;
                } catch (error) {
                    const anyError = error as any;
                    if (anyError?.finishReason === "SAFETY") {
                        // This is a censorship case, do not fallback
                        throw error;
                    }

                    // Any other error, try fallback
                    const lastMessage = messages[messages.length - 1];
                    await this.sendEphemeralRetryMessage(lastMessage);
                    try {
                        return await this.fallbackProvider.generate(history, character ?? undefined, isSFW);
                    } catch (fallbackError) {
                        // If the fallback also fails, throw the original error
                        throw error;
                    }
                }
            } else {
                return await this.llmProvider.generate(history, character ?? undefined, isSFW);
            }
        } finally {
            this.activeGenerations--;
        }
    }

    private async sendEphemeralRetryMessage(message: Message): Promise<void> {
        try {
            const reply = await message.reply({
                content: "A remote server error occurred, retrying with a fallback. Please wait.",
            });
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);
        } catch (e) {
            adze.error("Failed to send ephemeral retry message:", e);
        }
    }

    public getActiveGenerations(): number {
        return this.activeGenerations;
    }
}
