import { CharacterCard } from "../CharacterCard.ts";
import { MessageView } from "../types.ts";

export interface Prompt {
    history: MessageView[];
    systemInstruction?: string;
    tools?: any[];
    safetySettings?: any[];
}

export interface LLMResponse {
    completion: any;
}

export interface LLMProvider {
    setBotDiscordName(name: string): void;
    generate(
        messages: MessageView[],
        character?: CharacterCard,
        isSFW?: boolean,
    ): Promise<LLMResponse>;
}