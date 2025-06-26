import { TextEngine } from "./TextEngine.ts";
import { Attachment, Client, Guild, Message, TextChannel } from "discord.js";
import { replaceAllAsync } from "../replace.ts";
import { configService } from "./ConfigService.ts";
import { GifReader } from "npm:omggif";
import { PNG } from "npm:pngjs";
import { Buffer } from "node:buffer";
import { CharacterCard } from "../CharacterCard.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import adze from "npm:adze";
import { dumpDebug } from "../debug.ts";
import { retrieve_url, search_web, tools } from "../tools.ts";
import { MessageView } from "../types.ts";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { nodewhisper } from "npm:nodejs-whisper";

const TEXT_MIMETYPES = ["text/"];
const TEXT_EXTENSIONS = [
    ".txt", ".md", ".json", ".js", ".ts", ".py", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".java", ".html", ".css", ".xml", ".yaml", ".toml", ".sh", ".rb",
    ".php", ".go", ".rs", ".swift", ".kt", ".kts", ".lua", ".pl", ".pm",
    ".r", ".sql", ".cfg", ".conf", ".ini", ".log", ".diff", ".patch", ".csv",
];

function isTextBasedAttachment(attachment: Attachment): boolean {
    if (attachment.contentType && TEXT_MIMETYPES.some(mimetype => attachment.contentType!.startsWith(mimetype))) {
        return true;
    }
    const lowerCaseName = attachment.name.toLowerCase();
    return TEXT_EXTENSIONS.some(ext => lowerCaseName.endsWith(ext));
}

export class LLMService {
    private readonly textEngine: TextEngine;
    private activeGenerations = 0;

    constructor() {
        this.textEngine = new TextEngine();
    }

    public setBotDiscordName(name: string) {
        this.textEngine.setBotDiscordName(name);
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

        const lastResetIndex = messages.map((m) => m.content).findLastIndex((c) => c.includes(RESET_MESSAGE_CONTENT));

        if (lastResetIndex !== -1) {
            messages = messages.slice(lastResetIndex + 1);
        }

        const historyPromises = messages.filter((m) => m.content || m.embeds.length > 0).map(
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
                messageText = messageText.replace(/\n\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/\d+>\)/, "");

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
                    const attachmentProcessingPromises = message.attachments.map(async (a) => {
                        // Check if it's a text file
                        if (isTextBasedAttachment(a)) {
                            try {
                                const response = await fetch(a.url);
                                if (response.ok) {
                                    const textContent = await response.text();
                                    return { type: "text", name: a.name, content: textContent };
                                }
                            } catch (error) {
                                adze.error(`Failed to fetch text attachment ${a.name}:`, error);
                            }
                            return null;
                        }

                        // Check if it's an audio file for transcription
                        if (a.contentType?.startsWith("audio/")) {
                            try {
                                const response = await fetch(a.url);
                                if (response.ok) {
                                    const audioBuffer = await response.arrayBuffer();
                                    const tempPath = `/tmp/${a.name}`;
                                    await Deno.writeFile(tempPath, new Uint8Array(audioBuffer));
                                    const transcription = await nodewhisper(tempPath, { modelName: "tiny.en" });
                                    await Deno.remove(tempPath);
                                    return { type: "transcription", name: a.name, content: transcription };
                                }
                            } catch (error) {
                                adze.error(`Failed to transcribe audio attachment ${a.name}:`, error);
                            }
                            return null;
                        }

                        // Check if it's other media
                        if (a.contentType?.startsWith("image/") || a.contentType?.startsWith("video/")) {
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
                                                const frameData = Buffer.alloc(reader.width * reader.height * 4);
                                                reader.decodeAndBlitFrameRGBA(0, frameData);
                                                png.data = frameData;
                                                const pngBuffer = PNG.sync.write(png);
                                                const base64 = pngBuffer.toString("base64");
                                                return {
                                                    type: "media",
                                                    data: { inlineData: { mimeType: "image/png", data: base64 } },
                                                };
                                            } catch (error) {
                                                adze.error("Failed to process GIF attachment:", error);
                                                return null;
                                            }
                                        } else {
                                            const base64 = Buffer.from(buffer).toString("base64");
                                            return {
                                                type: "media",
                                                data: { inlineData: { mimeType: a.contentType!, data: base64 } },
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
                        }

                        // Otherwise, ignore
                        return null;
                    });

                    const processedAttachments = (await Promise.all(attachmentProcessingPromises)).filter(
                        (a): a is { type: "text" | "transcription"; name: string; content: string } | {
                            type: "media";
                            data: { inlineData: { mimeType: string; data: string } };
                        } => a !== null,
                    );

                    for (const attachment of processedAttachments) {
                        if (attachment.type === "text") {
                            finalMessageText += `\n\n--- Attachment: ${attachment.name} ---\n${attachment.content}\n--- End Attachment ---`;
                        } else if (attachment.type === "transcription") {
                            finalMessageText += `\n\n--- Transcribed Audio Attachment: ${attachment.name} ---\n${attachment.content}\n--- End Transcription ---`;
                        } else if (attachment.type === "media") {
                            mediaContent.push(attachment.data);
                        }
                    }
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
        const lastHumanMessage = history.slice().reverse().find((msg) => msg.role === "user");
        const username = lastHumanMessage?.user || "user";

        const prompt = this.textEngine.buildPrompt(history, username, character ?? undefined, isSFW);
        const lastMessage = messages[messages.length - 1];
        const logContext = lastMessage.guild
            ? `[Guild: ${lastMessage.guild.name} | Channel: ${
                (lastMessage.channel as TextChannel).name
            } | User: ${lastMessage.author.tag}]`
            : `[DM from ${lastMessage.author.tag}]`;
        await dumpDebug(logContext, "prompt", prompt);

        const generativeAi = new GoogleGenerativeAI(configService.getApiKey());
        const model = generativeAi.getGenerativeModel({
            model: configService.getModel(),
            tools: [{ functionDeclarations: tools }],
            systemInstruction: prompt.systemInstruction,
            safetySettings: prompt.safetySettings,
        });

        const chat = model.startChat({
            history: prompt.history as any,
        });

        const result = await chat.sendMessage("");
        const response = result.response;
        const toolCalls = response.functionCalls();

        if (toolCalls) {
            for (const toolCall of toolCalls) {
                const functionName = toolCall.name;
                const args = toolCall.args as { [key: string]: string };
                let result = "";
                if (functionName === "search_web") {
                    result = await search_web(args.query);
                } else if (functionName === "retrieve_url") {
                    result = await retrieve_url(args.url);
                }
                history.push({
                    role: "function",
                    name: functionName,
                    message: result,
                    messageId: "",
                    timestamp: new Date().toISOString(),
                    user: "Tool",
                });
            }
            const finalPrompt = this.textEngine.buildPrompt(history, username, character ?? undefined, isSFW);
            const finalChat = model.startChat({
                history: finalPrompt.history as any,
            });
            const finalResult = await finalChat.sendMessage("");
            return {
                completion: finalResult.response,
            };
        }

        return {
            completion: response,
        };
        } finally {
            this.activeGenerations--;
        }
    }

    public getActiveGenerations(): number {
        return this.activeGenerations;
    }
}
