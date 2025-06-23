import adze from "npm:adze@2.2.4";

export function getApiKey() {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) {
        adze.error("No Gemini API key provided");
        Deno.exit(1);
    }
    return key;
}

export function getBotToken() {
    const token = Deno.env.get("BOT_TOKEN");
    if (!token) {
        adze.error("No token provided");
        Deno.exit(1);
    }
    return token;
}

export function getModel() {
    const model = Deno.env.get("MODEL_NAME");
    if (!model) {
        adze.error("No model name provided");
        Deno.exit(1);
    }
    return model;
}

export function getTokenLimit() {
    const limitString = Deno.env.get("TOKEN_LIMIT");
    if (!limitString) {
        return 32600; // Sane limit
    }
    return parseInt(limitString, 10);
}

export function getBotSelfId() {
    const id = Deno.env.get("BOT_SELF_ID");
    if (!id) {
        adze.error("No bot self ID provided");
        Deno.exit(1);
    }
    return id;
}

/**
 * Get the public base URL for avatar serving
 * This should be a publicly accessible HTTPS URL with proper DNS
 * that proxies back to the local avatar server
 * Example: "https://avatars.yourdomain.com"
 */
export function getPublicAvatarBaseUrl(): string | undefined {
    return Deno.env.get("PUBLIC_AVATAR_BASE_URL");
}

/**
 * Get whether avatar server should be enabled
 */
export function isAvatarServerEnabled(): boolean {
    return Deno.env.get("ENABLE_AVATAR_SERVER") === "true";
}

/**
 * Get the local avatar server port
 */
export function getAvatarServerPort(): number {
    return parseInt(Deno.env.get("AVATAR_PORT") || "8080", 10);
}

export function getInferenceParallelism(): number {
    return parseInt(Deno.env.get("INFERENCE_PARALLELISM") || "1", 10);
}

export function isDebugEnabled(): boolean {
    return Deno.env.get("DEBUG") === "true";
}

export function getAdminOverrideId(): string | undefined {
    return Deno.env.get("ADMIN_OVERRIDE_ID");
}
