import { GoogleGenerativeAI } from "@google/generative-ai";
import { get_encoding } from "tiktoken";
import { configService } from "../services/ConfigService.ts";

const gemini = new GoogleGenerativeAI(configService.getGeminiApiKey());
const geminiModel = gemini.getGenerativeModel({ model: configService.getModel("gemini") });
const openAITokenizer = get_encoding("cl100k_base");

export async function countTokens(message: string, provider: "gemini" | "openai"): Promise<number> {
    if (message === "") return 0;

    if (provider === "gemini") {
        const result = await geminiModel.countTokens(message);
        return result.totalTokens;
    } else {
        const tokens = openAITokenizer.encode(message);
        return tokens.length;
    }
}
