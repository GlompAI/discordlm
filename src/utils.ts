export function getHelpText() {
    return `
Welcome to the bot! Here's a quick guide on how to interact:

**Commands:**
*   \`/switch <character>\`: Switch the active character for the current channel.
*   \`/list\`: Lists available characters.
*   \`/reset\`: Resets the conversation history with the bot.
*   \`/help\`: Shows this help message.

**How to Interact:**
*   **Direct Messages (DMs):** Send a message to the bot to talk to your character.
*   **In a Server:** Mention the bot (@<bot_name>) to talk to the active character.

**Message Actions:**
*   React with ♻️ on the bot's latest message to re-roll the response.
*   React with ❌ on one of the bot's messages to delete it.
*   React with ➡️ on the bot's latest message to have it continue generating a response.

**Roleplaying:**
*   Use asterisks for actions, like \`*I walk into the room*\`.
*   For out-of-character (OOC) messages, use the format: \`{OOC: your message here}\`.

Have fun!
    `.trim();
}

export function smartSplit(text: string, maxLength = 1980) {
    if (text.length <= maxLength) {
        return [text];
    }

    const parts: string[] = [];
    let currentPart = "";

    const lines = text.split("\n");
    let codeBlockFence: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith("```")) {
            if (codeBlockFence) {
                codeBlockFence = null;
            } else {
                codeBlockFence = line.trim();
            }
        }

        if (currentPart.length + line.length + 1 > maxLength) {
            if (codeBlockFence) {
                currentPart += "\n```";
            }
            parts.push(currentPart);
            currentPart = "";
            if (codeBlockFence) {
                currentPart = codeBlockFence + "\n";
            }
        }

        if (currentPart.length > 0) {
            currentPart += "\n";
        }
        currentPart += line;
    }

    parts.push(currentPart);

    const finalParts: string[] = [];
    for (const part of parts) {
        if (part.length > maxLength) {
            for (let i = 0; i < part.length; i += maxLength) {
                finalParts.push(part.substring(i, i + maxLength));
            }
        } else {
            finalParts.push(part);
        }
    }

    return finalParts;
}
