import { LLMProvider, LLMResponse } from "./provider.ts";
import { CharacterCard } from "../CharacterCard.ts";
import { MessageView } from "../types.ts";
import { Ollama } from "ollama";
import { configService } from "../services/ConfigService.ts";
import { TextEngine } from "../services/TextEngine.ts";
import { dumpDebug } from "../debug.ts";

export class OllamaProvider implements LLMProvider {
    private textEngine: TextEngine;
    private ollama: Ollama;

    constructor() {
        this.textEngine = new TextEngine();
        this.ollama = new Ollama({
            host: configService.getOllamaHost(),
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
        console.log("Using OllamaProvider");
        const lastHumanMessage = messages.slice().reverse().find((msg) => msg.role === "user");
        const username = lastHumanMessage?.user || "user";

        const prompt = this.textEngine.buildPrompt(messages, username, character, isSFW, "ollama");
        
        await dumpDebug("ollama-prompt", "prompt", prompt);

        const apiMessages: any[] = [];

        if (prompt.systemInstruction) {
            apiMessages.push({
                role: "system",
                content: prompt.systemInstruction,
            });
        }

        const adaptedHistory = prompt.history
            .map((message: MessageView) => {
                switch (message.role) {
                    case "user":
                        return { role: "user", content: message.message };
                    case "assistant":
                        return { role: "assistant", content: message.message };
                    default:
                        return null;
                }
            })
            .filter((m) => m !== null);

        apiMessages.push(...adaptedHistory);

        const response = await this.ollama.chat({
            model: configService.getModel(),
            messages: apiMessages,
        });

        return {
            text: () => response.message.content,
        };
    }
}