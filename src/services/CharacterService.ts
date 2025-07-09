import { CharacterManager } from "../CharacterManager.ts";
import { WebhookManager } from "../WebhookManager.ts";
import { AvatarServer } from "../AvatarServer.ts";
import { configService } from "./ConfigService.ts";
import { Client, TextBasedChannel } from "discord.js";
import adze from "adze";
import { CharacterConfig } from "../CharacterCard.ts";

export class CharacterService {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly characterManager: CharacterManager;
    private avatarServer: AvatarServer | null = null;

    constructor(private readonly client: Client, private readonly webhookManager: WebhookManager) {
        this.characterManager = new CharacterManager();
    }

    public async start(cloudflareHostname?: string): Promise<void> {
        let avatarBaseUrl: string | undefined;
        if (cloudflareHostname) {
            avatarBaseUrl = `https://${cloudflareHostname}`;
            this.logger.log(`Using Cloudflare tunnel for avatars: ${avatarBaseUrl}`);
        } else {
            this.logger.log("No Cloudflare tunnel running.");
        }

        this.logger.log(`[DEBUG] Determined avatarBaseUrl: ${avatarBaseUrl}`);
        this.logger.log(`Loading characters from ./characters with avatar base URL: ${avatarBaseUrl}`);
        await this.characterManager.loadCharacters("./characters", avatarBaseUrl);
        this.logger.log(`Character loading completed`);

        this.characterManager.watchCharacters();

        this.logger.log(`Initializing webhook manager...`);
        this.webhookManager.setCharacters(this.characterManager.getCharacters());
        this.logger.log(`Webhook manager initialized`);
    }

    public async stop(): Promise<void> {
        if (this.avatarServer) {
            await this.avatarServer.stop();
        }
        if (this.webhookManager) {
            await this.webhookManager.cleanup();
        }
    }

    public getCharacters(): CharacterConfig[] {
        return this.characterManager.getCharacters();
    }

    public getCharacter(name: string): CharacterConfig | null {
        return this.characterManager.getCharacter(name);
    }

    public getAssistantCharacter(): CharacterConfig {
        return this.characterManager.getAssistantCharacter();
    }

    public async inferCharacterFromHistory(channel: TextBasedChannel | null): Promise<CharacterConfig | null> {
        if (!channel) {
            return this.getAssistantCharacter();
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        for (const message of messages.values()) {
            if (message.author.id === this.client.user?.id && message.content.startsWith("Switched to ")) {
                const match = message.content.match(/Switched to (.+?)(?:\n|$)/);
                const characterName = match ? match[1] : message.content.substring("Switched to ".length).trim();
                const character = this.getCharacter(characterName);
                if (character) {
                    return character;
                }
            }

            if (message.webhookId) {
                const character = this.getCharacter(message.author.username);
                // Skip Aria to avoid selecting it from old interactions
                if (character && character.card.name !== "Aria") {
                    return character;
                }
            }

            if (message.embeds.length > 0 && (message.embeds[0].author?.name || message.embeds[0].title)) {
                const charName = message.embeds[0].author?.name || message.embeds[0].title;
                if (!charName) {
                    return this.getAssistantCharacter();
                }
                const character = this.getCharacter(charName);
                if (character) {
                    return character;
                }
            }
        }

        return this.getAssistantCharacter();
    }
}
