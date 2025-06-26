import { LLMProvider, LLMResponse } from "./provider.ts";
import { CharacterCard } from "../CharacterCard.ts";
import { MessageView } from "../types.ts";
import OpenAI from "openai";
import { configService } from "../services/ConfigService.ts";
import { TextEngine } from "../services/TextEngine.ts";
import { dumpDebug } from "../debug.ts";

export class OpenAIProvider implements LLMProvider {
    private textEngine: TextEngine;
    private openai: OpenAI;
    private toolsSupported = true;

    constructor() {
        this.textEngine = new TextEngine();
        this.openai = new OpenAI({
            apiKey: configService.getOpenAIKey(),
            baseURL: configService.getOpenAIBaseUrl(),
        });
    }

    public setBotDiscordName(name: string) {
        this.textEngine.setBotDiscordName(name);
    }

    public async generate(
        messages: MessageView[],
        character?: CharacterCard,
        isSFW = false,
    ): Promise<LLMResponse> {
        const lastHumanMessage = messages.slice().reverse().find((msg) => msg.role === "user");
        const username = lastHumanMessage?.user || "user";

        const prompt = this.textEngine.buildPrompt(messages, username, character, isSFW);
        
        await dumpDebug("openai-prompt", "prompt", prompt);

        const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        if (prompt.systemInstruction) {
            apiMessages.push({
                role: "system",
                content: prompt.systemInstruction,
            });
        }

        const visionEnabled = configService.isOpenAIVisionEnabled();
        const adaptedHistory = prompt.history
            .map((message: MessageView): OpenAI.Chat.Completions.ChatCompletionMessageParam | null => {
                const content: (OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage)[] = [{
                    type: "text",
                    text: message.message,
                }];

                if (visionEnabled && message.mediaContent) {
                    for (const media of message.mediaContent as { inlineData: { mimeType: string; data: string } }[]) {
                        content.push({
                            type: "image_url",
                            image_url: {
                                url: `data:${media.inlineData.mimeType};base64,${media.inlineData.data}`,
                            },
                        });
                    }
                }

                switch (message.role) {
                    case "user":
                        return { role: "user", content };
                    case "assistant":
                        return { role: "assistant", content: message.message };
                    case "function":
                        if (message.name) {
                            return { role: "function", name: message.name, content: message.message };
                        }
                        return null;
                    case "system":
                        return null;
                    default:
                        return null;
                }
            })
            .filter((m): m is OpenAI.Chat.Completions.ChatCompletionMessageParam => m !== null);

        apiMessages.push(...adaptedHistory);

        const request: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
            model: configService.getModel(),
            messages: apiMessages,
        };

        if (this.toolsSupported && prompt.tools) {
            request.tools = prompt.tools;
        }

        try {
            const response = await this.openai.chat.completions.create(request);
            return {
                completion: response,
            };
        } catch (error) {
            const anyError = error as any;
            if (anyError.code === "invalid_request_error" && anyError.message.includes("tools")) {
                this.toolsSupported = false;
                delete request.tools;
                const response = await this.openai.chat.completions.create(request);
                return {
                    completion: response,
                };
            }
            throw error;
        }
    }
}