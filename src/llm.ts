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

            if (characterName) {
                // Message is from a character via webhook/embed
                userName = characterName;
                fromSystem = false; // Assume it's from another character by default
                if (character && (characterName === character.name || characterName === character.char_name)) {
                    // It's from the system (the bot's current identity) only if the name matches the active character
                    fromSystem = true;
                }

                // Content is from embed description if present, otherwise from message content
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    messageText = message.embeds[0].description;
                } else {
                    messageText = message.content;
                }
            } else if (message.author.id === charId) {
                // Message is from the bot, but not a character reply (e.g. an error message)
                fromSystem = true;
                userName = character?.name || character?.char_name || "Assistant";
                messageText = message.content;
            } else {
                // Message is from a user
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

            return {
                message: finalMessageText,
                fromSystem,
                messageId: message.id,
                user: userName,
                timestamp: message.createdAt.toISOString(),
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
