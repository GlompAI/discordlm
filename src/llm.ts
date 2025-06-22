import TextEngine from "./TextEngine.ts";
import { Client, Guild, Message } from "npm:discord.js";
import Tokenizer from "npm:llama-tokenizer-js";
import { replaceAllAsync } from "./replace.ts";
import { getModel } from "./env.ts";
import { CharacterCard } from "./CharacterCard.ts";
import adze from "npm:adze";

export function countTokens(message: string): number {
    if (message == "") return 0;
    return Tokenizer.encode(message).length;
}
export async function generateMessage(
    client: Client,
    messages: Message[],
    charId: string,
    character: CharacterCard,
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

    // Helper function to get the character name from a message
    function getCharacterName(message: Message): string | null {
        // If it's a webhook message, the character name is in the webhook's username
        if (message.webhookId && (message as any).author?.username) {
            return (message as any).author.username;
        }
        // Check for embeds from the bot
        if (message.author.bot && message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.author?.name) {
                return embed.author.name;
            }
        }
        return null;
    }

    const history = await Promise.all(
        messages.filter((m) => m.content).map(async (message) => {
            const content = message.content
                ? await replaceAllAsync(
                    message.content,
                    /<@(\d+)/g,
                    (_, snowflake) => convertSnowflake(snowflake, message.guild),
                )
                : "";

            // Determine if this message is from the current character (system)
            let fromSystem = false;
            let userName = "";
            let messageText = content;

            const characterName = getCharacterName(message);

            if (characterName) {
                // This is a message from a character (webhook or embed)
                if (characterName === character.name || characterName === character.char_name) {
                    fromSystem = true;
                    userName = characterName;
                } else {
                    fromSystem = false;
                    userName = characterName;
                }
                // For embeds, the content is in the description
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    messageText = message.embeds[0].description;
                }
            } else if (message.author.id === charId) {
                // This is from the bot itself (not webhook or embed) - treat as system
                fromSystem = true;
                userName = character.name || character.char_name || "Assistant";
            } else {
                // Regular user message
                fromSystem = false;
                userName = await convertSnowflake(message.author.id, message.guild);
            }

            return {
                message: messageText,
                fromSystem,
                messageId: message.id,
                user: userName,
            };
        }),
    );
    // Get the username from the last human message (not from the bot)
    const lastHumanMessage = history.slice().reverse().find((msg) => !msg.fromSystem);
    const username = lastHumanMessage?.user || "user";

    const engine = new TextEngine();
    const chatHistory = engine.buildPrompt(history, username, character);
    return {
        completion: await engine.client.chat({
            stream: false, // <- required!
            //@ts-expect-error Any model name may be provided
            model: getModel(),
            messages: await chatHistory,
        }),
    };
}
