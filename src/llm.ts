import TextEngine from "./TextEngine.ts";
import { Client, Guild, Message, TextChannel } from "npm:discord.js";
import Tokenizer from "npm:llama-tokenizer-js";
import { replaceAllAsync } from "./replace.ts";
import { getModel } from "./env.ts";
import { CharacterCard } from "./CharacterCard.ts";
import adze from "npm:adze";
import { dumpDebug } from "./debug.ts";
import { RESET_MESSAGE_CONTENT } from "./main.ts";

export function countTokens(message: string): number {
    if (message == "") return 0;
    return Tokenizer.encode(message).length;
}
export async function generateMessage(
    client: Client,
    messages: Message[],
    charId: string,
    character: CharacterCard | null,
) {
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
        // If it's a webhook message, the character name is in the webhook's username
        if (message.webhookId && (message as any).author?.username) {
            return (message as any).author.username;
        }
        // Check for embeds from the bot
        if (message.author.bot && message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.title) {
                return embed.title;
            }
        }
        return null;
    }

    // Find the last reset message and truncate history
    const lastResetIndex = messages.map((m) => m.content).lastIndexOf(
        RESET_MESSAGE_CONTENT,
    );

    if (lastResetIndex !== -1) {
        messages = messages.slice(lastResetIndex + 1);
    }

    const history = await Promise.all(
        messages.filter((m) => m.content || m.embeds.length > 0).map(async (message) => {
            let fromSystem = false;
            let userName = "";
            let messageText = "";

            const characterName = getCharacterName(message); // Gets name from webhook or embed title

            // First, check if the message is a raw reply from the bot.
            // This happens if the author is the bot AND it's not a character reply (no webhook/embed title).
            if (message.author.id === charId && !characterName) {
                fromSystem = true;
                userName = "Assistant"; // Raw bot replies are always from "Assistant"
                messageText = message.content;
            } else if (characterName) {
                // This is a character message (from a webhook or an embed with a title).
                userName = characterName;
                // It's from the "system" if the character name matches the currently active character.
                fromSystem = (character?.name === characterName) || (character?.char_name === characterName);

                // Get message content from embed or raw content
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    messageText = message.embeds[0].description;
                } else {
                    messageText = message.content;
                }
            } else {
                // It's a message from a human user.
                fromSystem = false;
                userName = await convertSnowflake(message.author.id, message.guild);
                messageText = message.content;
            }

            // Replace mentions in the final text
            const finalMessageText = await replaceAllAsync(
                messageText,
                /<@(\d+)>/g,
                async (_, snowflake) => `@${await convertSnowflake(snowflake, message.guild)}`,
            );

            const imageContent = message.attachments.filter((a) => a.contentType?.startsWith("image/")).map((a) => ({
                type: "image_url" as const,
                image_url: { url: a.url },
            }));

            return {
                message: finalMessageText,
                fromSystem,
                messageId: message.id,
                user: userName,
                timestamp: message.createdAt.toISOString(),
                imageContent: imageContent.length > 0 ? imageContent : undefined,
            };
        }),
    );
    // Get the username from the last human message (not from the bot)
    const lastHumanMessage = history.slice().reverse().find((msg) => !msg.fromSystem);
    const username = lastHumanMessage?.user || "user";

    const engine = new TextEngine();
    const chatHistory = await engine.buildPrompt(history, username, character ?? undefined);
    const lastMessage = messages[messages.length - 1];
    const logContext = lastMessage.guild
        ? `[Guild: ${lastMessage.guild.name} | Channel: ${
            (lastMessage.channel as TextChannel).name
        } | User: ${lastMessage.author.tag}]`
        : `[DM from ${lastMessage.author.tag}]`;
    await dumpDebug(logContext, "prompt", chatHistory);
    return {
        completion: await engine.client.chat({
            stream: false, // <- required!
            //@ts-expect-error Any model name may be provided
            model: getModel(),
            messages: chatHistory,
        }),
    };
}
