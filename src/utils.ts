import { userMention } from "discord.js";
import { configService } from "./services/ConfigService.ts";

export function getHelpText() {
    const assistantName = configService.getAssistantName();
    const botId = configService.getBotSelfId();
    return `
Welcome to the bot! Here's a quick guide on how to interact:

**Commands:**
*   \`/switch <character>\`: Switch the active character for the current channel.
*   \`/list\`: Lists available characters.
*   \`/reset\`: Resets the conversation history with the bot.
*   \`/help\`: Shows this help message.

**How to Interact:**
*   **Direct Messages (DMs):** Send a message to the bot to talk to your character.
*   **In a Server:** Reply to any character message to have that character reply to you. You can also reply to the \`/switch\` message.
*   **Assistant:** Mention ${userMention(botId)} anywhere to invoke the assistant directly, without a character persona.

**Message Actions:**
*   **Reroll (♻️):** Re-generates the bot's last response.
*   **Delete (❌):** Deletes the bot's message.
*   **Continue (➡️):** Prompts the bot to continue its last message.

**Roleplaying:**
*   Use asterisks for actions, like \`*I walk into the room*\`.
*   For out-of-character (OOC) messages, use the format: \`{OOC: your message here}\`.

Have fun!
    `.trim();
}

export function smartSplit(text: string, maxLength = 1980): string[] {
    if (text.length <= maxLength) {
        return [text];
    }

    const parts: string[] = [];
    let currentPart = "";
    let inCodeBlock = false;
    let codeBlockLang = "";

    const lines = text.split("\n");

    for (const line of lines) {
        if (line.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            if (inCodeBlock) {
                codeBlockLang = line.substring(3);
            }
        }

        if (currentPart.length + line.length + 1 > maxLength) {
            if (inCodeBlock) {
                currentPart += "\n```";
            }
            parts.push(currentPart);
            currentPart = "";
            if (inCodeBlock) {
                currentPart = "```" + codeBlockLang + "\n";
            }
        }

        if (currentPart.length > 0 || line.trim().length > 0) {
            currentPart += (currentPart.length > 0 ? "\n" : "") + line;
        }
    }

    if (currentPart.length > 0) {
        parts.push(currentPart);
    }

    return parts;
}
