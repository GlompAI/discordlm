import { App } from "./App.ts";

export const RESET_MESSAGE_CONTENT = "--- Bot conversation history reset ---";

import { createHash } from "node:crypto";

const app = new App();

const secretsToHash = [
    "BOT_TOKEN",
    "BOT_SELF_ID",
    "GEMINI_API_KEY",
    "ADMIN_OVERRIDE_ID",
    "USER_ID_LIST",
    "OPENAI_API_KEY",
];

for (const secret of secretsToHash) {
    const value = Deno.env.get(secret);
    if (value) {
        const hash = createHash("sha256").update(value).digest("hex");
        console.log(`Secret ${secret} hash: ${hash}`);
    }
}

app.start();
