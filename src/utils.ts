import { userMention } from "discord.js";
import { configService } from "./services/ConfigService.ts";

export function getHelpText() {
    const botId = configService.botSelfId!;
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

**Roleplaying:**
*   Use asterisks for actions, like \`*I walk into the room*\`.
*   For out-of-character (OOC) messages, use the format: \`{OOC: your message here}\`. This is intended to help steer the character's behavior, but may not always be effective depending on the character and the request.

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
        // Handle very long lines by splitting them immediately.
        if (line.length > maxLength) {
            if (currentPart.length > 0) {
                parts.push(currentPart);
                currentPart = "";
            }
            // Split the long line itself
            const words = line.split(' ');
            let tempLine = '';
            for (const word of words) {
                if (tempLine.length + word.length + 1 > maxLength) {
                    parts.push(tempLine);
                    tempLine = '';
                }
                if (tempLine.length > 0) {
                    tempLine += ' ';
                }
                tempLine += word;
            }
            if (tempLine.length > 0) {
                parts.push(tempLine);
            }
            continue;
        }

        // Check if adding the new line will exceed the max length.
        if (currentPart.length + line.length + 1 > maxLength) {
            if (inCodeBlock) {
                currentPart += "\n```";
            }
            parts.push(currentPart);
            currentPart = "";
            if (inCodeBlock) {
                currentPart = "```" + codeBlockLang;
            }
        }

        if (currentPart.length > 0) {
            currentPart += "\n";
        }
        currentPart += line;

        // Update code block status *after* processing the line.
        if (line.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            if (inCodeBlock) {
                codeBlockLang = line.substring(3);
            } else {
                codeBlockLang = "";
            }
        }
    }

    if (currentPart.length > 0) {
        parts.push(currentPart);
    }

    return parts;
}
