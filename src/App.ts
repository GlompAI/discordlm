import { DiscordService } from "./services/DiscordService.ts";
import { CharacterService } from "./services/CharacterService.ts";
import { LLMService } from "./services/LLMService.ts";
import { ConversationService } from "./services/ConversationService.ts";
import { InteractionCreateHandler } from "./handlers/InteractionCreateHandler.ts";
import { MessageCreateHandler } from "./handlers/MessageCreateHandler.ts";
import { WebhookManager } from "./WebhookManager.ts";
import { Events, SlashCommandBuilder } from "discord.js";
import adze from "adze";
import { createHash } from "node:crypto";
import { configService } from "./services/ConfigService.ts";
import { CloudflareService } from "./services/CloudflareService.ts";
import { AvatarServer } from "./AvatarServer.ts";
import { PremiumService } from "./services/PremiumService.ts";

export class App {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly version = "1.1.0";
    private readonly discordService: DiscordService;
    private readonly characterService: CharacterService;
    private readonly llmService: LLMService;
    private readonly conversationService: ConversationService;
    private readonly webhookManager: WebhookManager;
    private readonly interactionCreateHandler: InteractionCreateHandler;
    private readonly messageCreateHandler: MessageCreateHandler;
    private readonly cloudflareService: CloudflareService;
    private readonly avatarServer: AvatarServer;
    private isShuttingDown = false;

    constructor() {
        this.discordService = new DiscordService();
        this.webhookManager = new WebhookManager(this.discordService.client, []);
        this.characterService = new CharacterService(this.discordService.client, this.webhookManager);
        this.llmService = new LLMService();
        this.conversationService = new ConversationService();
        this.interactionCreateHandler = new InteractionCreateHandler(
            this.characterService,
            this.llmService,
            this.discordService.client,
            this.webhookManager,
        );
        this.messageCreateHandler = new MessageCreateHandler(
            this.characterService,
            this.llmService,
            this.discordService.client,
            this.webhookManager,
        );
        this.cloudflareService = new CloudflareService();
        this.avatarServer = new AvatarServer();
    }

    public async start(): Promise<void> {
        this.avatarServer.start();
        const cloudflareHostname = await this.cloudflareService.start();
        this.logSecretHashes();
        this.discordService.onReady(async (client) => {
            if (client.user) {
                this.logger.log(`Ready! Logged in as ${client.user.tag}`);
                // Set the bot's Discord name in the LLM service
                this.llmService.setBotDiscordName(client.user.username);
                configService.botSelfId = client.user.id;
            }
            await this.registerSlashCommands();
            this.avatarServer.setReady(true);
            await this.characterService.start(cloudflareHostname);
            await PremiumService.getInstance().init(this.discordService.client);
            this.logger.log("Bot startup complete!");
        });

        this.discordService.client.on(
            Events.InteractionCreate,
            (interaction) => {
                if (this.isShuttingDown) return;
                this.interactionCreateHandler.handle(interaction);
            },
        );
        this.discordService.client.on(Events.MessageCreate, (message) => {
            if (this.isShuttingDown) return;
            this.messageCreateHandler.handle(message);
        });

        await this.discordService.login();

        Deno.addSignalListener("SIGINT", () => this.stop());
        Deno.addSignalListener("SIGTERM", () => this.stop());
    }

    public async stop(): Promise<void> {
        this.logger.log("Shutting down...");
        this.isShuttingDown = true;
        this.avatarServer.setReady(false);

        while (this.llmService.getActiveGenerations() > 0) {
            this.logger.log(`Waiting for ${this.llmService.getActiveGenerations()} active generations to complete...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await this.characterService.stop();
        await this.cloudflareService.stop();
        await this.avatarServer.stop();
        await this.discordService.destroy();
        Deno.exit();
    }

    private async registerSlashCommands(): Promise<void> {
        const commands = [
            new SlashCommandBuilder()
                .setName("switch")
                .setDescription("Switch to a different character")
                .addStringOption((option) =>
                    option.setName("character")
                        .setDescription("The character to switch to (optional, will show a menu if not provided)")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addBooleanOption((option) =>
                    option.setName("intro")
                        .setDescription("Show the character's introduction message (default: true, DMs only)")
                        .setRequired(false)
                ),
            new SlashCommandBuilder()
                .setName("list")
                .setDescription("List all available characters")
                .addIntegerOption((option) =>
                    option.setName("page")
                        .setDescription("The page number to display")
                        .setRequired(false)
                ),
            new SlashCommandBuilder()
                .setName("reset")
                .setDescription("Reset the conversation history for the bot"),
            new SlashCommandBuilder()
                .setName("help")
                .setDescription("Shows the help message"),
        ];

        try {
            const devGuildId = configService.getDevGuildId();
            if (devGuildId) {
                await this.discordService.client.application?.commands.set(commands, devGuildId);
                this.logger.info(`Successfully registered slash commands to guild ${devGuildId}`);
            } else {
                await this.discordService.client.application?.commands.set(commands);
                this.logger.info("Successfully registered global slash commands");
            }
        } catch (error) {
            this.logger.error("Failed to register slash commands:", error);
        }
    }

    private logSecretHashes(): void {
        const secretsToHash = [
            "BOT_TOKEN",
            "GEMINI_API_KEY",
            "OPENAI_API_KEY",
        ];

        const secretsToLog = [
            "ADMIN_OVERRIDE_ID",
            "USER_ID_LIST",
            "LIMIT_USER_IDS",
            "GEMINI_TOKEN_LIMIT",
            "OPENAI_TOKEN_LIMIT",
            "RATE_LIMIT_PER_MINUTE",
            "DEBUG",
            "MAX_HISTORY_MESSAGES",
            "OPENAI_BASE_URL",
            "GEMINI_BASE_URL",
            "OPENAI_BASE_URL",
        ];

        for (const secret of secretsToHash) {
            const value = Deno.env.get(secret);
            if (value) {
                const hash = createHash("sha256").update(value).digest("hex");
                this.logger.info(`Secret ${secret} hash: ${hash}`);
            }
        }

        for (const secret of secretsToLog) {
            const value = Deno.env.get(secret);
            if (value) {
                this.logger.info(`Value ${secret}: ${value}`);
            }
        }
    }
}
