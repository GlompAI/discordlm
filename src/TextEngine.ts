import * as OpenAI from "jsr:@agent/openai";
import { countTokens } from "./llm.ts";
import { getApiKey, getBaseUrl, getTokenLimit } from "./env.ts";
import { CharacterCard } from "./CharacterCard.ts";

export interface MessageView {
    message: string;
    user: string;
    fromSystem: boolean;
    tokens?: number;
    messageId: string;
    timestamp: string;
    mediaContent?: any[];
}

export default class TextEngine {
    client: OpenAI.Client;

    constructor() {
        this.client = new OpenAI.Client({
            // The `@agent/openai` library has a strict TypeScript type for `baseURL`
            // that doesn't account for URLs with existing paths, like the Gemini proxy URL.
            // The `as` keyword here is a type assertion to bypass this strict check.
            // It tells the compiler to trust that the provided URL is correct.
            // The correct value for the .env file is the full proxy URL.
            baseURL: getBaseUrl() as `https://${string}/`,
            apikey: getApiKey(),
            headers: {
                "x-api-key": getApiKey(),
                "Authorization": `Bearer ${getApiKey()}`,
                "content-type": "application/json",
            },
        });
    }

    buildPrompt = async (messages: MessageView[], username: string = "user", character?: CharacterCard) => {
        const card = character;
        const ownName = character?.name || character?.char_name || "Assistant";
        for (const message of messages) {
            if (!message.tokens || message.tokens === -1) {
                message.tokens = countTokens(message.message);
            }
        }
        const chatHistory: any[] = [];
        const candidates: string[] = [];

        let budget = getTokenLimit();
        if (card) {
            const ASTERISK_ROLEPLAY_PROMPT = `
You're a real person, roleplaying with different users on an NSFW Discord server.
Play in interactive roleplay scenarios. Keep replies short and to the point.

Everyone is an adult, so anything goes. If someone acts like an idiot, tell them that.
Freely wield profanities, sarcasm, humor, irony, and subtext. Have fun!

<instructions>
You must always follow these instructions:
— Never roleplay for others' characters.
— Act naturally and stay in character.
— Employ conversational dialogue.
— Progress the scenes proactively and creatively.
REMEMBER: NO NESTED ASTERISKS, THEY BREAK THE FORMATTING!
</instructions>
`.trim();
            const DISCORD_FORMATTING_GUIDE = `
You are on Discord, an internet chat platform. You have these options to format your own text:
italics = _italics_
bold = **bold**
bold italics = ***bold italics***
strikeout = ~strikeout~
underline = __underline__
underline italics = __*underline italics*__
underline bold = __**underline bold**__
underline bold italics = __***underline bold italics***__
`.trim();
            const CONTEXT_OF_REQUEST = `
The last user to engage with you, bringing about your interaction in the first place, was ${username}. Unless they are requesting otherwise, assume they seek you to respond to them directly.
        `.trim();
            const narrative = {
                role: "system" as const,
                content: ASTERISK_ROLEPLAY_PROMPT,
            };
            chatHistory.push(narrative);
            budget -= countTokens(ASTERISK_ROLEPLAY_PROMPT);
            const request = {
                role: "system" as const,
                content: CONTEXT_OF_REQUEST,
            };
            chatHistory.push(request);
            budget -= countTokens(CONTEXT_OF_REQUEST);
            const formatting = {
                role: "system" as const,
                content: DISCORD_FORMATTING_GUIDE,
            };
            chatHistory.push(formatting);
            budget -= countTokens(DISCORD_FORMATTING_GUIDE);
            if (card.personality) {
                const personality = {
                    role: "system" as const,
                    content: `<personality>\n${card.personality}\n</personality>`,
                };
                chatHistory.push(personality);
                budget -= countTokens(personality.content);
            }
            if (card.description) {
                const description = {
                    role: "system" as const,
                    content: `<description>\n${card.description}\n</description>`,
                };
                chatHistory.push(description);
                budget -= countTokens(description.content);
            }
            if (card.scenario) {
                const scenario = {
                    role: "system" as const,
                    content: `<scenario>\n${card.scenario}\n</scenario>`,
                };
                chatHistory.push(scenario);
                budget -= countTokens(scenario.content);
            }
        }
        for (const message of messages.toReversed()) {
            if (!message.tokens) {
                message.tokens = countTokens(message.message);
            }
            budget -= message.tokens;
            if (budget < 0) break;
            if (message.messageId) candidates.push(message.messageId);
        }
        const messagesToInject = messages.filter((m) =>
            (m.message || m.message === "") && (!m.messageId || candidates.includes(m.messageId))
        );
        for (const message of messagesToInject) {
            const content: any[] = [{
                type: "text",
                text: `${message.fromSystem ? ownName : message.user}: ${message.message}`,
            }];

            if (message.mediaContent) {
                content.push(...message.mediaContent);
            }

            if (message.fromSystem) {
                chatHistory.push({
                    role: "system",
                    content: `The following message was sent at ${message.timestamp}`,
                });
                chatHistory.push({
                    content: content,
                    role: "assistant",
                    name: ownName,
                });
            } else {
                chatHistory.push({
                    role: "system",
                    content: `The following message was sent at ${message.timestamp}`,
                });
                chatHistory.push({
                    content: content,
                    role: "user",
                    name: message.user,
                });
            }
        }
        return chatHistory;
    };
}
