import { CharacterManager } from "../CharacterManager.ts";
import { WebhookManager } from "../WebhookManager.ts";
import { AvatarServer } from "../AvatarServer.ts";
import { configService } from "./ConfigService.ts";
import { Client, TextBasedChannel, TextChannel } from "npm:discord.js";
import adze from "npm:adze";
import { CharacterConfig } from "../CharacterCard.ts";

export class CharacterService {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly characterManager: CharacterManager;
    private webhookManager!: WebhookManager;
    private avatarServer: AvatarServer | null = null;

    constructor(private readonly client: Client) {
        this.characterManager = new CharacterManager();
    }

    public async start(): Promise<void> {
        let avatarBaseUrl: string | undefined;
        const publicAvatarBaseUrl = configService.getPublicAvatarBaseUrl();

        if (publicAvatarBaseUrl) {
            avatarBaseUrl = publicAvatarBaseUrl;
            this.logger.log(`Using public avatar base URL: ${avatarBaseUrl}`);
        }

        if (configService.isAvatarServerEnabled()) {
            this.logger.log(`Starting local avatar server...`);
            this.avatarServer = new AvatarServer(configService.getAvatarServerPort());
            await this.avatarServer.start();

            if (!publicAvatarBaseUrl) {
                avatarBaseUrl = `http://localhost:${configService.getAvatarServerPort()}`;
                this.logger.log(`Local avatar server started with base URL: ${avatarBaseUrl}`);
            } else {
                this.logger.log(
                    `Local avatar server started on port ${configService.getAvatarServerPort()} (proxied via ${publicAvatarBaseUrl})`,
                );
            }
        }

        this.logger.log(`Loading characters from ./characters with avatar base URL: ${avatarBaseUrl}`);
        await this.characterManager.loadCharacters("./characters", avatarBaseUrl);
        await this.characterManager.loadAssistantCharacter("./characters");
        this.logger.log(`Character loading completed`);

        this.characterManager.watchCharacters();

        this.logger.log(`Initializing webhook manager...`);
        this.webhookManager = new WebhookManager(this.client, this.characterManager.getCharacters());
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

    public getAssistantCharacter(): CharacterConfig | null {
        return this.characterManager.getAssistantCharacter();
    }

    public async inferCharacterFromHistory(channel: TextBasedChannel | null): Promise<CharacterConfig | null> {
        if (!channel) {
            return this.getAssistantCharacter();
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        for (const message of messages.values()) {
            if (message.author.id === this.client.user?.id && message.content.startsWith("Switched to ")) {
                const characterName = message.content.substring("Switched to ".length);
                const character = this.getCharacter(characterName);
                if (character) {
                    return character;
                }
            }

            if (message.webhookId) {
                const character = this.getCharacter(message.author.username);
                if (character) {
                    return character;
                }
            }

            if (message.embeds.length > 0 && message.embeds[0].title) {
                const character = this.getCharacter(message.embeds[0].title);
                if (character) {
                    return character;
                }
            }
        }

        return this.getAssistantCharacter();
    }

    public getWebhookManager(): WebhookManager {
        return this.webhookManager;
    }
}
