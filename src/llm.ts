import TextEngine from "./TextEngine.ts";
import { Client, Guild, Message } from "npm:discord.js";
import Tokenizer from "npm:llama-tokenizer-js";
import { replaceAllAsync } from "./replace.ts";
import { getModel } from "./env.ts";
import adze from "npm:adze";

export function countTokens(message: string): number {
    if (message == "") return 0;
    return Tokenizer.encode(message).length;
}
export async function generateMessage(
    client: Client,
    messages: Message[],
    charId: string,
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
    const history = await Promise.all(
        messages.filter((m) => m.content).map(async (message) => {
            const content = await replaceAllAsync(
                message.content,
                /<@(\d+)/g,
                (_, snowflake) => convertSnowflake(snowflake, message.guild),
            );
            return {
                message: content,
                fromSystem: message.author.id == charId,
                messageId: message.id,
                user: await convertSnowflake(message.author.id, message.guild),
            };
        }),
    );
    const engine = new TextEngine();
    const chatHistory = engine.buildPrompt(history);
    return {
        completion: await engine.client.chat({
            stream: false, // <- required!
            //@ts-expect-error Any model name may be provided
            model: getModel(),
            max_tokens: 256,
            messages: await chatHistory,
        }),
    };
}
