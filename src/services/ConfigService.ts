import "https://deno.land/std@0.224.0/dotenv/load.ts";

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
        return this.getEnv("BOT_TOKEN", true);
    }

    getBotSelfId(): string {
        return this.getEnv("BOT_SELF_ID", true);
    }

    getApiKey(): string {
        return this.getEnv("GEMINI_API_KEY", true);
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

    getAdminOverrideId(): string | undefined {
        return this.getEnv("ADMIN_OVERRIDE_ID", false, "");
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
}

export const configService = new ConfigService();
