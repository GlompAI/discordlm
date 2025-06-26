import { LLMProvider, LLMResponse } from "./provider.ts";
import { CharacterCard } from "../CharacterCard.ts";
import { MessageView } from "../types.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { configService } from "../services/ConfigService.ts";
import { TextEngine } from "../services/TextEngine.ts";
import { tools, search_web, retrieve_url } from "../tools.ts";
import { dumpDebug } from "../debug.ts";

export class GeminiProvider implements LLMProvider {
    private textEngine: TextEngine;
    private generativeAi: GoogleGenerativeAI;

    constructor() {
        this.textEngine = new TextEngine();
        this.generativeAi = new GoogleGenerativeAI(configService.getGeminiApiKey());
    }

    public setBotDiscordName(name: string) {
        this.textEngine.setBotDiscordName(name);
    }

    private adaptPrompt(prompt: any, character?: CharacterCard) {
        const history = prompt.history.map((message: MessageView) => {
            const ownName = character?.name || character?.char_name || "Assistant";
            const content = `${message.role === "assistant" ? ownName : message.user}: ${message.message}`;
            let role: "user" | "model" | "function";
            let parts: any[];

            if (message.role === "assistant") {
                role = "model";
                parts = [{ text: content }];
            } else if (message.role === "function") {
                role = "function";
                parts = [{ functionResponse: { name: message.name!, response: { content: message.message } } }];
            } else {
                role = "user";
                parts = [{ text: content }];
                if (message.mediaContent) {
                    parts.push(...message.mediaContent);
                }
            }
            return { role, parts };
        });

        return {
            ...prompt,
            history,
            systemInstruction: {
                role: "system",
                parts: [{ text: prompt.systemInstruction }],
            },
        };
    }

    public async generate(
        messages: MessageView[],
        character?: CharacterCard,
        isSFW = false,
    ): Promise<LLMResponse> {
        console.log("Using GeminiProvider");
        const lastHumanMessage = messages.slice().reverse().find((msg) => msg.role === "user");
        const username = lastHumanMessage?.user || "user";

        const prompt = this.textEngine.buildPrompt(messages, username, character, isSFW);
        const adaptedPrompt = this.adaptPrompt(prompt, character);

        await dumpDebug("gemini-prompt", "prompt", adaptedPrompt);

        const model = this.generativeAi.getGenerativeModel({
            model: configService.getModel(),
            tools: [{ functionDeclarations: tools }],
            systemInstruction: adaptedPrompt.systemInstruction,
            safetySettings: adaptedPrompt.safetySettings,
        });

        const chat = model.startChat({
            history: adaptedPrompt.history,
        });

        const result = await chat.sendMessage("");
        const response = result.response;
        const toolCalls = response.functionCalls();

        if (toolCalls) {
            const historyWithToolCalls = [...messages];
            for (const toolCall of toolCalls) {
                const functionName = toolCall.name;
                const args = toolCall.args as { [key: string]: string };
                let result = "";
                if (functionName === "search_web") {
                    result = await search_web(args.query);
                } else if (functionName === "retrieve_url") {
                    result = await retrieve_url(args.url);
                }
                historyWithToolCalls.push({
                    role: "function",
                    name: functionName,
                    message: result,
                    messageId: "",
                    timestamp: new Date().toISOString(),
                    user: "Tool",
                });
            }
            const finalPrompt = this.textEngine.buildPrompt(historyWithToolCalls, username, character, isSFW);
            const finalAdaptedPrompt = this.adaptPrompt(finalPrompt, character);
            const finalChat = model.startChat({
                history: finalAdaptedPrompt.history,
            });
            const finalResult = await finalChat.sendMessage("");
            return {
                text: () => finalResult.response.text(),
            };
        }

        return {
            text: () => response.text(),
        };
    }
}