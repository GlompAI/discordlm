import "https://deno.land/std@0.224.0/dotenv/load.ts";
import adze from "adze";

export class ConfigService {
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

    getBotSelfId(): string {
        return this.getEnv("BOT_SELF_ID", true);
    }

    getApiKey(): string {
        return this.getEnv("GEMINI_API_KEY", true);
    }

    getGeminiBaseUrl(): string | undefined {
        return this.getEnv("GEMINI_BASE_URL", false, "");
    }

    getModel(): string {
        return this.getEnv("MODEL_NAME", false, "gemini-1.5-flash");
    }

    getTokenLimit(): number {
        return parseInt(this.getEnv("TOKEN_LIMIT", false, "32600"));
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

    isAvatarServerEnabled(): boolean {
        return this.getEnv("ENABLE_AVATAR_SERVER", false, "false") === "true";
    }

    getAvatarServerPort(): number {
        return parseInt(this.getEnv("AVATAR_PORT", false, "8080"));
    }

    getPublicAvatarBaseUrl(): string | undefined {
        return this.getEnv("PUBLIC_AVATAR_BASE_URL", false, "");
    }

    isDebugEnabled(): boolean {
        return this.getEnv("DEBUG", false, "false") === "true";
    }
    getAssistantName(): string {
        return this.getEnv("ASSISTANT_NAME", false, "Aria");
    }

    getRateLimitPerMinute(): number {
        return parseInt(this.getEnv("RATE_LIMIT_PER_MINUTE", false, "10"));
    }

    getUserIdList(): string {
        return this.getEnv("USER_ID_LIST", false, "");
    }

    isWhitelistEnabled(): boolean {
        return this.getEnv("WHITELIST_ENABLE", false, "false") === "true";
    }

    getMaxHistoryMessages(): number {
        return parseInt(this.getEnv("MAX_HISTORY_MESSAGES", false, "200"));
    }
}

export const configService = new ConfigService();
