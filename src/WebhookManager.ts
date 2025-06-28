import {
    Client,
    hideLinkEmbed,
    hyperlink,
    Message,
    TextChannel,
    User,
    Webhook,
    WebhookMessageCreateOptions,
    WebhookMessageEditOptions,
} from "discord.js";
import { CharacterConfig } from "./CharacterCard.ts";
import adze from "npm:adze";

const logger = adze.withEmoji.timestamp.seal();
export const WEBHOOK_IDENTIFIER = "\u200B";

export class WebhookManager {
    private webhooks = new Map<string, Webhook>(); // character name -> webhook
    private client: Client;
    private characters: CharacterConfig[];

    constructor(client: Client, characters: CharacterConfig[]) {
        this.client = client;
        this.characters = characters;
    }

    /**
     * Get or create a webhook for a specific character in a channel
     * Returns null if webhooks aren't supported in this channel type
     */
    async getWebhookForCharacter(channel: TextChannel, character: CharacterConfig): Promise<Webhook | null> {
        const webhookKey = `${channel.id}-${character.card.name}`;

        // Check if we already have a cached webhook
        if (this.webhooks.has(webhookKey)) {
            const webhook = this.webhooks.get(webhookKey)!;
            try {
                // Verify the webhook still exists by trying to edit it
                await webhook.edit({ name: webhook.name });
                return webhook;
            } catch (error) {
                this.webhooks.delete(webhookKey);
                logger.warn(
                    `Webhook for ${character.card.name} in channel ${channel.name} was deleted, will recreate.`,
                );
                console.log(error);
            }
        }

        try {
            // Look for existing webhook with this character's name
            let existingWebhooks = await channel.fetchWebhooks();
            let webhook = existingWebhooks.find((wh) => wh.name === character.card.name);

            if (!webhook) {
                // If we're about to create a new webhook, check if we're at the limit
                if (existingWebhooks.size >= 15) {
                    logger.warn(
                        `Channel ${channel.name} has ${existingWebhooks.size} webhooks, which is at the Discord limit. Attempting to rotate out an old one.`,
                    );

                    // Find the oldest webhook to remove.
                    const oldestWebhook = existingWebhooks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                        .first();

                    if (oldestWebhook) {
                        logger.info(`Deleting oldest webhook "${oldestWebhook.name}" to make room for new one.`);
                        await oldestWebhook.delete("Rotating out old webhook to make room for a new one.");

                        // Re-fetch webhooks to ensure the list is up-to-date
                        existingWebhooks = await channel.fetchWebhooks();
                        if (existingWebhooks.size >= 15) {
                            logger.error(
                                `Failed to free up a webhook slot in channel ${channel.name}. Aborting creation.`,
                            );
                            return null;
                        }
                    } else {
                        // This case should be impossible if existingWebhooks.size >= 15, but we'll log it.
                        logger.error(
                            `Could not find an oldest webhook to delete in channel ${channel.name}, despite being at the limit.`,
                        );
                        return null;
                    }
                }
                // Create new webhook
                logger.info(`Creating webhook for character ${character.card.name} in channel ${channel.name}`);

                // Try to use the character's avatar if available
                let avatar: string | undefined;
                if (character.avatarUrl) {
                    try {
                        // Check if it's a URL or file path
                        if (character.avatarUrl.startsWith("http://") || character.avatarUrl.startsWith("https://")) {
                            // Use URL directly
                            avatar = character.avatarUrl;
                        } else if (character.avatarUrl.startsWith("./") || character.avatarUrl.startsWith("/")) {
                            // No public URL configured, skip avatar
                        } else {
                            // Assume it's already a URL
                            avatar = character.avatarUrl;
                        }
                    } catch (error) {
                        logger.warn(`Failed to process avatar for ${character.card.name}:`, error);
                    }
                }

                webhook = await channel.createWebhook({
                    name: character.card.name,
                    avatar: avatar,
                    reason: `Auto-created webhook for character ${character.card.name}`,
                });

                logger.info(`Created webhook for ${character.card.name}: ${webhook.url}`);
            } else {
                logger.info(`Using existing webhook for ${character.card.name}`);
            }

            // Cache the webhook
            this.webhooks.set(webhookKey, webhook);
            return webhook;
        } catch (error) {
            logger.warn(
                `Failed to create/get webhook for ${character.card.name} (falling back to regular reply):`,
                error,
            );
            return null;
        }
    }

    /**
     * Send a message as a specific character using their webhook
     */
    async sendAsCharacter(
        channel: TextChannel,
        character: CharacterConfig,
        content: string,
        options?: Partial<WebhookMessageCreateOptions>,
        messageToReply?: Message,
        interactingUser?: User,
    ): Promise<Message | null> {
        const webhook = await this.getWebhookForCharacter(channel, character);

        if (!webhook) {
            logger.error(`No webhook available for character ${character.card.name}`);
            return null;
        }

        try {
            let author = interactingUser;
            if (messageToReply?.content.includes("[Generated by")) {
                const authorIdMatch = messageToReply.content.match(
                    /\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/(\d+)>\)/,
                );
                if (authorIdMatch) {
                    author = await this.client.users.fetch(authorIdMatch[1]);
                }
            }
            if (!author) {
                author = messageToReply?.author;
            }

            const url = author ? `https://discord.com/users/${author.id}` : "";
            const botName = author?.displayName ?? this.client.user?.username ?? "Aria";
            const link = hyperlink(`Generated by ${botName}`, hideLinkEmbed(url));
            const sendOptions: WebhookMessageCreateOptions = {
                content: `${content}\n${link}`,
                username: character.card.name,
                avatarURL: character.avatarUrl,
                ...options,
            };

            const sentMessage = await webhook.send(sendOptions);
            return sentMessage;
        } catch (error) {
            logger.error(`Failed to send message as ${character.card.name}:`, error);
            return null;
        }
    }

    async editAsCharacter(
        message: Message,
        character: CharacterConfig,
        content: string,
        options?: Partial<WebhookMessageCreateOptions>,
    ): Promise<Message | null> {
        if (!message.webhookId) {
            logger.warn("Cannot edit a message that was not sent by a webhook.");
            return null;
        }

        const webhook = await this.client.fetchWebhook(message.webhookId);
        if (!webhook) {
            logger.warn(`Could not fetch webhook with ID ${message.webhookId}`);
            return null;
        }

        try {
            const authorIdMatch = message.content.match(
                /\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/(\d+)>\)/,
            );
            const authorId = authorIdMatch ? authorIdMatch[1] : null;
            const author = authorId ? await this.client.users.fetch(authorId) : null;
            const botName = author?.displayName ?? this.client.user?.username ?? "Aria";
            const url = author ? `https://discord.com/users/${author.id}` : "";
            const link = hyperlink(`Generated by ${botName}`, hideLinkEmbed(url));
            let finalContent = content;
            if (!finalContent.includes("[Generated by")) {
                finalContent = `${content}\n${link}`;
            }
            const editOptions: WebhookMessageCreateOptions = {
                content: finalContent,
                ...options,
            };

            const editedMessage = await webhook.editMessage(message.id, editOptions as WebhookMessageEditOptions);
            return editedMessage;
        } catch (error) {
            logger.error(`Failed to edit message as ${character.card.name}:`, error);
            return null;
        }
    }

    /**
     * Clean up webhooks (call this on shutdown)
     */
    cleanup(): void {
        logger.info("Cleaning up webhooks...");
        this.webhooks.clear();
    }

    /**
     * Update characters list (call this when characters are reloaded)
     */
    setCharacters(characters: CharacterConfig[]): void {
        this.characters = characters;
        // Optionally clear webhook cache to force recreation with new character data
        this.webhooks.clear();
    }
}
