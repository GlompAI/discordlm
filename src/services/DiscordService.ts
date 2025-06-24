import { Client, GatewayIntentBits, Partials } from "npm:discord.js";
import { configService } from "./ConfigService.ts";
import adze from "npm:adze";

export class DiscordService {
    public readonly client: Client;
    private readonly logger = adze.withEmoji.timestamp.seal();

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.DirectMessageReactions,
            ],
            partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
        });
    }

    public async login(): Promise<void> {
        this.logger.log("Attempting to login to Discord...");
        try {
            await this.client.login(configService.getBotToken());
            this.logger.log("Discord login successful");
        } catch (error) {
            this.logger.error("Discord login failed:", error);
            Deno.exit(1);
        }
    }

    public onReady(callback: (client: Client) => void): void {
        this.client.once("ready", callback);
    }

    public destroy(): Promise<void> {
        return this.client.destroy();
    }
}
