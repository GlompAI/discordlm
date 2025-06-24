import { DiscordService } from "./services/DiscordService.ts";
import { CharacterService } from "./services/CharacterService.ts";
import { LLMService } from "./services/LLMService.ts";
import { ConversationService } from "./services/ConversationService.ts";
import { InteractionCreateHandler } from "./handlers/InteractionCreateHandler.ts";
import { MessageCreateHandler } from "./handlers/MessageCreateHandler.ts";
import { Events, SlashCommandBuilder } from "npm:discord.js";
import adze from "npm:adze";

export class App {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly discordService: DiscordService;
    private readonly characterService: CharacterService;
    private readonly llmService: LLMService;
    private readonly conversationService: ConversationService;
    private readonly interactionCreateHandler: InteractionCreateHandler;
    private readonly messageCreateHandler: MessageCreateHandler;

    constructor() {
        this.discordService = new DiscordService();
        this.characterService = new CharacterService(this.discordService.client);
        this.llmService = new LLMService();
        this.conversationService = new ConversationService();
        this.interactionCreateHandler = new InteractionCreateHandler(
            this.characterService,
            this.llmService,
            this.conversationService,
            this.discordService.client,
        );
        this.messageCreateHandler = new MessageCreateHandler(
            this.characterService,
            this.llmService,
            this.conversationService,
            this.discordService.client,
        );
    }

    public async start(): Promise<void> {
        this.discordService.onReady(async (client) => {
            if (client.user) {
                this.logger.log(`Ready! Logged in as ${client.user.tag}`);
            }
            await this.characterService.start();
            await this.registerSlashCommands();
            this.logger.log("Bot startup complete!");
        });

        this.discordService.client.on(
            Events.InteractionCreate,
            (interaction) => this.interactionCreateHandler.handle(interaction),
        );
        this.discordService.client.on(Events.MessageCreate, (message) => this.messageCreateHandler.handle(message));

        await this.discordService.login();

        Deno.addSignalListener("SIGINT", () => this.stop());
        Deno.addSignalListener("SIGTERM", () => this.stop());
    }

    public async stop(): Promise<void> {
        this.logger.log("Shutting down...");
        await this.characterService.stop();
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
            await this.discordService.client.application?.commands.set(commands);
            this.logger.info("Successfully registered slash commands");
        } catch (error) {
            this.logger.error("Failed to register slash commands:", error);
        }
    }
}
