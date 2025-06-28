import "https://deno.land/std@0.224.0/dotenv/load.ts";
import adze from "adze";

export class ConfigService {
    public botSelfId: string | null = null;
    private getEnv(key: string, required: true): string;
    private getEnv(key: string, required: false, defaultValue: string): string;
    private getEnv(key: string, required: boolean, defaultValue?: string): string | undefined {
        const value = Deno.env.get(key);
        if (required && !value) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
        return value ?? defaultValue;
    }

    getBotToken(): string {
        const token = this.getEnv("BOT_TOKEN", true);
        adze.debug("Retrieved Bot Token:", token);
        return token;
    }

    getGeminiApiKey(): string {
        return this.getEnv("GEMINI_API_KEY", false, "");
    }

    getGeminiBaseUrl(): string | undefined {
        return this.getEnv("GEMINI_BASE_URL", false, "");
    }

    getOpenAIKey(): string {
        return this.getEnv("OPENAI_API_KEY", false, "");
    }

    getOpenAIBaseUrl(): string {
        return this.getEnv("OPENAI_BASE_URL", false, "https://api.openai.com/v1");
    }

    isOpenAIVisionEnabled(): boolean {
        return this.getEnv("OPENAI_VISION_SUPPORT", false, "false") === "true";
    }

    getOpenAICustomHeaderKey(): string {
        return this.getEnv("OPENAI_CUSTOM_HEADER_KEY", false, "x-api-key");
    }

    getModel(provider?: "gemini" | "openai"): string {
        if (provider === "openai") {
            return this.getEnv("OPENAI_MODEL_NAME", false, "gpt-4-turbo");
        }
        return this.getEnv("GEMINI_MODEL_NAME", false, "gemini-1.5-flash");
    }

    getGeminiTokenLimit(): number {
        return parseInt(this.getEnv("GEMINI_TOKEN_LIMIT", false, "1000000"));
    }

    getOpenAITokenLimit(): number {
        return parseInt(this.getEnv("OPENAI_TOKEN_LIMIT", false, "32768"));
    }

    getInferenceParallelism(): number {
        return parseInt(this.getEnv("INFERENCE_PARALLELISM", false, "1"));
    }

    getAdminOverrideList(): string[] {
        const adminIds = this.getEnv("ADMIN_OVERRIDE_ID", false, "");
        if (!adminIds) {
            return [];
        }
        return adminIds.split(";").filter((id) => id.trim() !== "");
    }


    isDebugEnabled(): boolean {
        return this.getEnv("DEBUG", false, "false") === "true";
    }
    getAssistantName(): string {
        return this.getEnv("ASSISTANT_NAME", false, "Aria");
    }

    getRateLimitPerMinute(): number {
        return parseInt(this.getEnv("RATE_LIMIT_PER_MINUTE", false, "4"));
    }

    getUserIdList(): string {
        return this.getEnv("USER_ID_LIST", false, "");
    }

    getLimitUserIds(): string[] {
        const userIds = this.getEnv("LIMIT_USER_IDS", false, "");
        if (!userIds) {
            return [];
        }
        return userIds.split(";").filter((id) => id.trim() !== "");
    }

    isWhitelistEnabled(): boolean {
        return this.getEnv("WHITELIST_ENABLE", false, "false") === "true";
    }

    getMaxHistoryMessages(): number {
        return parseInt(this.getEnv("MAX_HISTORY_MESSAGES", false, "200"));
    }

    getProvider(): "gemini" | "openai" {
        return this.getEnv("LLM_PROVIDER", false, "gemini") as "gemini" | "openai";
    }

    getCloudflareTunnelId(): string | undefined {
        return this.getEnv("CLOUDFLARE_TUNNEL_ID", false, "");
    }

    getCloudflareCredentialsFile(): string | undefined {
        return this.getEnv("CLOUDFLARE_CREDENTIALS_FILE", false, "");
    }

    getCloudflareHostname(): string | undefined {
        return this.getEnv("CLOUDFLARE_HOSTNAME", false, "");
    }
}

export const configService = new ConfigService();
