import adze from "npm:adze@2.2.4";

export function getApiKey() {
    const key = Deno.env.get("OPENAI_KEY");
    if (!key) {
        adze.error("No key provided");
        Deno.exit(1);
    }
    return key;
}

export function getBaseUrl() {
    const url = Deno.env.get("OPENAI_URL");
    if (!url) {
        adze.error("No URL provided");
        Deno.exit(1);
    }
    return url;
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
