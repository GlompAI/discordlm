import { userMention } from "discord.js";
import { configService } from "./services/ConfigService.ts";

export const HELP_TEXT_CONTENT = `
Welcome to the bot! Here's a quick guide on how to interact:

**Commands:**
*   \`/switch <character>\`: Switch the active character for the current channel.
*   \`/list\`: Lists available characters.
*   \`/reset\`: Resets the conversation history with the bot.
*   \`/help\`: Shows this help message.

**How to Interact:**
*   **Direct Messages (DMs):** Send a message to the bot to talk to your selected character. (None selected is the default assistant).
*   **In a Server:** Reply to any character message to have that character reply to you. You can also reply to the \`/switch\` message.
*   **Fake Mentions:** Use @CharName without a real ping to trigger a character from the /switch list directly!
*   **Assistant:** Mention BOT_MENTION_PLACEHOLDER anywhere to invoke the assistant directly, without a character persona.

**Message Actions:**
*   **Reroll (♻️):** Re-generates the bot's last response.
*   **Delete (❌):** Deletes the bot's message.
*   You may only call actions on messages you generated yourself, and may only delete if you have premium.

**Roleplaying:**
*   Use asterisks for actions, like \`*I walk into the room*\`.
*   For out-of-character (OOC) messages, use the format: \`{OOC: your message here}\`. This is intended to help steer the character's behavior, but may not always be effective depending on the character and the request.
*   You can also request longer content with OOC messages like \`{OOC: give me five paragraphs}\`.
*   You can adjust this format over time and the bot will adjust.

Have fun!

This bot is open-source under the AGPL-3.0 license. Its terms are here: https://www.gnu.org/licenses/agpl-3.0-standalone.html
You can find the bot's source code at https://github.com/GlompAI/discordlm/
`.trim();

export function getHelpText() {
    const botId = configService.botSelfId!;
    return HELP_TEXT_CONTENT.replace("BOT_MENTION_PLACEHOLDER", userMention(botId));
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
            const words = line.split(" ");
            let tempLine = "";
            for (const word of words) {
                if (tempLine.length + word.length + 1 > maxLength) {
                    parts.push(tempLine);
                    tempLine = "";
                }
                if (tempLine.length > 0) {
                    tempLine += " ";
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
