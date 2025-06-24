import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    Interaction,
    Message,
    StringSelectMenuInteraction,
    TextBasedChannel,
    TextChannel,
} from "npm:discord.js";
import { CharacterService } from "../services/CharacterService.ts";
import { dumpDebug } from "../debug.ts";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { getHelpText } from "../utils.ts";
import adze from "npm:adze";
import { ComponentService } from "../services/ComponentService.ts";
import { LLMService } from "../services/LLMService.ts";
import { ConversationService } from "../services/ConversationService.ts";
import { Queue } from "../queue.ts";
import { configService } from "../services/ConfigService.ts";

export class InteractionCreateHandler {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly componentService: ComponentService;
    private readonly inferenceQueue: Queue;

    constructor(
        private readonly characterService: CharacterService,
        private readonly llmService: LLMService,
        private readonly conversationService: ConversationService,
        private readonly client: Client,
    ) {
        this.componentService = new ComponentService();
        this.inferenceQueue = new Queue(configService.getInferenceParallelism());
    }

    public async handle(interaction: Interaction): Promise<void> {
        const logContext = interaction.guild
            ? `[Guild: ${interaction.guild.name} | Channel: ${
                (interaction.channel as TextChannel).name
            } | User: ${interaction.user.tag}]`
            : `[DM from ${interaction.user.tag}]`;

        try {
            if (interaction.isAutocomplete()) {
                await this.handleAutocomplete(interaction);
                return;
            }

            if (interaction.isMessageComponent()) {
                await this.handleComponentInteraction(interaction, logContext);
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;

            if (commandName === "switch") {
                await this.handleSwitchCommand(interaction);
            } else if (commandName === "list") {
                const page = interaction.options.getInteger("page") || 1;
                await this.handleListCommand(interaction, page);
            } else if (commandName === "reset") {
                await this.handleResetCommand(interaction);
            } else if (commandName === "help") {
                await interaction.reply({ content: getHelpText(), ephemeral: true });
            }
        } catch (error) {
            this.logger.error("Error in onInteractionCreate:", error);
            await dumpDebug(logContext, "interaction-error", error);
            if ("replied" in interaction && (interaction.replied || interaction.deferred)) {
                await interaction.followUp({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            } else {
                if ("reply" in interaction) {
                    await interaction.reply({
                        content: "There was an error while executing this command!",
                        ephemeral: true,
                    });
                }
            }
        }
    }

    private async handleAutocomplete(interaction: any) {
        if (interaction.commandName === "switch") {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const characters = this.characterService.getCharacters();
            const choices = characters.map((char) => ({ name: char.card.name, value: char.card.name }));

            const filtered = choices.filter((choice) => choice.name.toLowerCase().startsWith(focusedValue)).slice(
                0,
                25,
            );

            await interaction.respond(filtered);
        }
    }

    private async handleComponentInteraction(interaction: Interaction, logContext: string) {
        if (!interaction.isMessageComponent()) return;

        const message = interaction.message as Message;

        if (interaction.customId === "delete") {
            await message.delete();
            return;
        }

        if (interaction.customId === "reroll") {
            if (!interaction.isButton()) return;
            await this.handleReroll(interaction, message, logContext);
        }

        if (interaction.customId === "continue") {
            if (!interaction.isButton()) return;
            await this.handleContinue(interaction, message, logContext);
        }

        if (interaction.customId === "character-select") {
            if (!interaction.isStringSelectMenu()) return;
            const characterName = interaction.values[0];
            const character = this.characterService.getCharacter(characterName);
            if (character) {
                await interaction.update({
                    content: `Switched to **${character.card.name}**`,
                    components: [],
                });
                if (interaction.channel?.type === ChannelType.DM) {
                    await interaction.channel.send(RESET_MESSAGE_CONTENT);
                }
            }
        }

        if (interaction.customId === "confirm-reset") {
            await interaction.update({ content: RESET_MESSAGE_CONTENT, components: [] });
        }

        if (interaction.customId.startsWith("list-")) {
            const currentPage = parseInt(interaction.customId.split("-")[2]);
            const newReply = await this.generateListReply(currentPage, interaction.channel as TextChannel);
            await (interaction as any).update(newReply);
        }
    }

    private async handleSwitchCommand(interaction: any) {
        const characterName = interaction.options.getString("character");
        if (characterName) {
            // Handle old command format
            const character = this.characterService.getCharacter(characterName);
            if (character) {
                await interaction.reply(`Switched to ${character.card.name}`);
                if (interaction.channel?.type === ChannelType.DM) {
                    await interaction.channel.send(RESET_MESSAGE_CONTENT);
                }
            } else {
                const availableChars = this.characterService.getCharacters().map((c) => c.card.name).join(", ");
                await interaction.reply(
                    `Character "${characterName}" not found. Available characters: ${availableChars}`,
                );
            }
        } else {
            // New dropdown format
            const characters = this.characterService.getCharacters();
            const currentCharacter = await this.characterService.inferCharacterFromHistory(interaction.channel);
            const selectMenu = this.componentService.createCharacterSelectMenu(characters, currentCharacter);
            await interaction.reply({
                content: "Select a character to switch to:",
                components: [selectMenu],
                ephemeral: true,
            });
        }
    }

    private async handleResetCommand(interaction: any) {
        const confirmButton = new ButtonBuilder()
            .setCustomId("confirm-reset")
            .setLabel("Confirm Reset")
            .setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);
        await interaction.reply({
            content: "Are you sure you want to reset the conversation history?",
            components: [row],
            ephemeral: true,
        });
    }

    private async handleListCommand(interaction: any, page: number) {
        const reply = await this.generateListReply(page, interaction.channel);
        await interaction.reply({ ...reply, ephemeral: true });
    }

    private async handleReroll(interaction: ButtonInteraction, message: Message, logContext: string) {
        this.logger.info(`${logContext} Re-rolling message ID ${message.id}...`);
        await interaction.deferUpdate();

        let typingInterval: number | undefined;
        try {
            const channel = message.channel;
            if (channel.isTextBased() && "sendTyping" in channel) {
                await channel.sendTyping();
                typingInterval = setInterval(() => {
                    channel.sendTyping();
                }, 9000);
            }

            this.logger.info(`${logContext} Fetching message history for re-roll...`);
            const messages = Array.from(
                (await message.channel.messages.fetch({ limit: 100, before: message.id })).values(),
            );
            messages.reverse();

            let character = null;
            if (message.webhookId) {
                character = this.characterService.getCharacter(message.author.username);
            } else if (message.embeds.length > 0 && message.embeds[0].title) {
                character = this.characterService.getCharacter(message.embeds[0].title);
            }
            this.logger.info(`${logContext} Using character for re-roll: ${character ? character.card.name : "none"}`);

            this.logger.info(`${logContext} Generating new response...`);
            const result = (await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService),
                this.client,
                messages,
                configService.getBotSelfId(),
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
            ))
                .completion.text();

            if (!result) {
                await this.sendEphemeralError(
                    interaction,
                    "Oops! It seems my response was blocked again. Please try rephrasing your message or using `/reset`.",
                );
                return;
            }

            const webhookManager = this.characterService.getWebhookManager();
            if (message.webhookId && webhookManager && character) {
                await webhookManager.editAsCharacter(message, character, result);
            } else {
                const embed = new EmbedBuilder()
                    .setTitle(character ? character.card.name : "Assistant")
                    .setThumbnail(character?.avatarUrl ?? null)
                    .setDescription(result);
                await message.edit({ embeds: [embed] });
            }
            this.logger.info(`${logContext} Re-roll successful for message ID ${message.id}`);
        } catch (error) {
            this.logger.error(`${logContext} Failed to re-roll response for message ID ${message.id}:`, error);
        } finally {
            if (typingInterval) {
                clearInterval(typingInterval);
            }
        }
    }

    private async handleContinue(interaction: ButtonInteraction, message: Message, logContext: string) {
        this.logger.info(`${logContext} Continue interaction on message ID ${message.id}...`);
        await interaction.deferUpdate();
        await message.edit({ components: [] });

        let typingInterval: number | undefined;
        try {
            const channel = message.channel;
            if (channel.isTextBased() && "sendTyping" in channel) {
                await channel.sendTyping();
                typingInterval = setInterval(() => {
                    channel.sendTyping();
                }, 9000);
            }

            const messages = Array.from(
                (await message.channel.messages.fetch({ limit: 100, before: message.id })).values(),
            );
            messages.push(message);
            messages.reverse();

            let character = null;
            if (message.webhookId) {
                character = this.characterService.getCharacter(message.author.username);
            } else if (message.embeds.length > 0 && message.embeds[0].title) {
                character = this.characterService.getCharacter(message.embeds[0].title);
            }

            const result = (await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService),
                this.client,
                messages,
                configService.getBotSelfId(),
                character ? character.card : null,
                Math.floor(Math.random() * 1000000), // seed
                true, // continuation
            ))
                .completion.text();

            if (!result) {
                await this.sendEphemeralError(
                    interaction,
                    "Oops! It seems my response was blocked. Please try again.",
                );
                return;
            }

            const webhookManager = this.characterService.getWebhookManager();
            if (webhookManager && character && message.channel instanceof TextChannel) {
                const sentMessage = await webhookManager.sendAsCharacter(
                    message.channel,
                    character,
                    result,
                    { components: [this.componentService.createActionRow()] },
                );
                if (sentMessage) {
                    this.conversationService.setLastBotMessage(message.channel.id, sentMessage);
                }
            } else if (message.channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle(character ? character.card.name : "Assistant")
                    .setThumbnail(character?.avatarUrl ?? null)
                    .setDescription(result);
                if ("send" in message.channel) {
                    const sentMessage = await message.channel.send({
                        embeds: [embed],
                        components: [this.componentService.createActionRow()],
                    });
                    this.conversationService.setLastBotMessage(message.channel.id, sentMessage);
                }
            }
            this.logger.info(`${logContext} Continuation successful for message ID ${message.id}`);
        } catch (error) {
            this.logger.error(`${logContext} Failed to continue response for message ID ${message.id}:`, error);
        } finally {
            if (typingInterval) {
                clearInterval(typingInterval);
            }
        }
    }

    private async sendEphemeralError(interaction: ButtonInteraction, content: string) {
        try {
            await interaction.followUp({
                content,
                ephemeral: true,
            });
        } catch (e) {
            this.logger.error("Failed to send ephemeral error message:", e);
        }
    }

    private async generateListReply(page: number, channel: TextBasedChannel | null) {
        const allCharacters = this.characterService.getCharacters();
        const currentChar = await this.characterService.inferCharacterFromHistory(channel);
        const itemsPerPage = 4;
        const totalPages = Math.ceil(allCharacters.length / itemsPerPage);
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;

        const characterSlice = allCharacters.slice(start, end);

        const embeds = characterSlice.map((char) => {
            let description = char.card.description ||
                (char.card as { data?: { description?: string } }).data?.description;
            const embed = new EmbedBuilder()
                .setTitle(char.card.name)
                .setColor(char === currentChar ? 0x00FF00 : 0x0099FF);

            if (description && description.trim() !== "") {
                if (description.length > 256) {
                    description = description.substring(0, 250) + "...";
                }
                embed.setDescription(description);
            }

            if (char.avatarUrl) {
                embed.setThumbnail(char.avatarUrl);
            }

            if (char === currentChar) {
                embed.setFooter({ text: "Current Character" });
            }
            return embed;
        });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`list-prev-${page - 1}`)
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId(`list-next-${page + 1}`)
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page >= totalPages),
            );

        return {
            embeds,
            components: [row],
        };
    }
}
