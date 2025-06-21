import { Client, TextChannel, Webhook, WebhookMessageCreateOptions } from "npm:discord.js";
import { CharacterConfig } from "./CharacterCard.ts";
import { getPublicAvatarBaseUrl } from "./env.ts";
import adze from "npm:adze";

const logger = adze.withEmoji.timestamp.seal();

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
                // Webhook was deleted, remove from cache
                this.webhooks.delete(webhookKey);
                logger.warn(`Webhook for ${character.card.name} in channel ${channel.name} was deleted`);
            }
        }

        try {
            // Look for existing webhook with this character's name
            const existingWebhooks = await channel.fetchWebhooks();
            let webhook = existingWebhooks.find((wh) => wh.name === character.card.name);

            if (!webhook) {
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
                            // For file paths, try to use public avatar base URL
                            const publicBaseUrl = getPublicAvatarBaseUrl();
                            if (publicBaseUrl) {
                                // Convert file path to public URL
                                const fileName = character.avatarUrl.replace(/^\.\//, "").replace(/^\//, "");
                                avatar = `${publicBaseUrl.replace(/\/$/, "")}/${fileName}`;
                            } else {
                                // No public URL configured, skip avatar
                            }
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
    ): Promise<boolean> {
        const webhook = await this.getWebhookForCharacter(channel, character);

        if (!webhook) {
            logger.error(`No webhook available for character ${character.card.name}`);
            return false;
        }

        try {
            const sendOptions: any = {
                content,
                username: character.card.name,
                ...options,
            };

            // Set avatarURL if available, converting file paths to public URLs if needed
            if (character.avatarUrl) {
                if (character.avatarUrl.startsWith("http://") || character.avatarUrl.startsWith("https://")) {
                    // Use URL directly
                    sendOptions.avatarURL = character.avatarUrl;
                } else if (character.avatarUrl.startsWith("./") || character.avatarUrl.startsWith("/")) {
                    // Convert file path to public URL if public base URL is configured
                    const publicBaseUrl = getPublicAvatarBaseUrl();
                    if (publicBaseUrl) {
                        const fileName = character.avatarUrl.replace(/^\.\//, "").replace(/^\//, "");
                        sendOptions.avatarURL = `${publicBaseUrl.replace(/\/$/, "")}/${fileName}`;
                    }
                } else {
                    // Assume it's already a URL
                    sendOptions.avatarURL = character.avatarUrl;
                }
            }

            await webhook.send(sendOptions);
            return true;
        } catch (error) {
            logger.error(`Failed to send message as ${character.card.name}:`, error);
            return false;
        }
    }

    /**
     * Clean up webhooks (call this on shutdown)
     */
    async cleanup(): Promise<void> {
        logger.info("Cleaning up webhooks...");
        this.webhooks.clear();
    }

    /**
     * Update characters list (call this when characters are reloaded)
     */
    updateCharacters(characters: CharacterConfig[]): void {
        this.characters = characters;
        // Optionally clear webhook cache to force recreation with new character data
        this.webhooks.clear();
    }
}
