import {
    ActionRowBuilder,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    EmbedBuilder,
    hideLinkEmbed,
    hyperlink,
    Interaction,
    Message,
    TextBasedChannel,
    TextChannel,
} from "discord.js";
import { PremiumService } from "../services/PremiumService.ts";
import { CharacterService } from "../services/CharacterService.ts";
import { dumpDebug } from "../debug.ts";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { getHelpText } from "../utils.ts";
import adze from "adze";
import { WebhookManager } from "../WebhookManager.ts";
import { ComponentService } from "../services/ComponentService.ts";
import { LLMService } from "../services/LLMService.ts";
import { Queue } from "../queue.ts";
import { configService } from "../services/ConfigService.ts";
import { accessControlService } from "../services/AccessControlService.ts";

export class InteractionCreateHandler {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly componentService: ComponentService;
    private readonly inferenceQueue: Queue;
    private isShuttingDown = false;

    constructor(
        private readonly characterService: CharacterService,
        private readonly llmService: LLMService,
        private readonly client: Client,
        private readonly webhookManager: WebhookManager,
    ) {
        this.componentService = new ComponentService();
        this.inferenceQueue = new Queue(configService.getInferenceParallelism());
    }

    public async handle(interaction: Interaction): Promise<void> {
        if (this.isShuttingDown) return;

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
                await interaction.reply({ content: getHelpText(), flags: [64] });
            }
        } catch (error) {
            this.logger.error("Error in onInteractionCreate:");
            console.log(error);
            await dumpDebug(logContext, "interaction-error", error);
            if ("replied" in interaction && (interaction.replied || interaction.deferred)) {
                await interaction.followUp({
                    content: "There was an error while executing this command!",
                    flags: [64],
                });
            } else {
                if ("reply" in interaction) {
                    await interaction.reply({
                        content: "There was an error while executing this command!",
                        flags: [64],
                    });
                }
            }
        }
    }

    private async handleAutocomplete(interaction: AutocompleteInteraction) {
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
            if (interaction.channel?.type === ChannelType.DM) {
                const premiumService = PremiumService.getInstance();
                const member = await premiumService.guild?.members.fetch({ user: interaction.user.id, force: true });
                if (!member || !await premiumService.isPremium(member)) {
                    await interaction.reply({
                        content: "You must be a premium user to delete messages in DMs.",
                        ephemeral: true,
                    });
                    return;
                }
            } else {
                const authorIdMatch = message.content.match(
                    /\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/(\d+)>\)/,
                );
                const authorId = authorIdMatch ? authorIdMatch[1] : null;
                if (authorId && interaction.user.id !== authorId) {
                    await interaction.reply({ content: "You can only delete your own interactions.", ephemeral: true });
                    return;
                }
            }

            try {
                await message.delete();
                // If in DM, acknowledge the deletion since the message is gone
                if (interaction.channel?.type === ChannelType.DM) {
                    await interaction.reply({ content: "Message deleted.", ephemeral: true });
                }
            } catch (error) {
                this.logger.error(`Failed to delete message ${message.id}:`, error);

                // Handle specific error cases
                if (error instanceof Error && "code" in error) {
                    if ((error as any).code === 10008) {
                        // Unknown Message - already deleted
                        await interaction.reply({ content: "This message has already been deleted.", ephemeral: true });
                    } else if (error.message?.includes("connection reset") || error.message?.includes("ECONNRESET")) {
                        // Network error - try to acknowledge the interaction at least
                        await interaction.reply({
                            content: "Network error while deleting message. Please try again.",
                            ephemeral: true,
                        }).catch(() => {
                            // If we can't even reply, just log it
                            this.logger.error("Could not send error response to user");
                        });
                    } else {
                        // Generic error
                        await interaction.reply({
                            content: "Failed to delete message. Please try again later.",
                            ephemeral: true,
                        }).catch(() => {
                            this.logger.error("Could not send error response to user");
                        });
                    }
                }
            }
            return;
        }

        if (interaction.customId === "reroll") {
            if (interaction.channel?.type !== ChannelType.DM) {
                const authorIdMatch = message.content.match(
                    /\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/(\d+)>\)/,
                );
                const authorId = authorIdMatch ? authorIdMatch[1] : null;
                if (authorId && interaction.user.id !== authorId) {
                    await interaction.reply({
                        content: "You can only re-roll your own interactions.",
                        ephemeral: true,
                    });
                    return;
                }
            }
            if (!interaction.isButton()) return;
            await this.handleReroll(interaction, message, logContext);
        }

        if (interaction.customId === "character-select") {
            if (!interaction.isStringSelectMenu()) return;
            const characterName = interaction.values[0];
            const character = this.characterService.getCharacter(characterName);
            if (character) {
                await interaction.update({
                    content: interaction.channel?.type == ChannelType.DM
                        ? `Switched to ${characterName}\nYou may wish to /reset.`
                        : `Switched to ${characterName}`,
                    components: [],
                });
            }
        }

        if (interaction.customId === "confirm-reset") {
            if (!interaction.isButton()) return;
            if (interaction.channel && "send" in interaction.channel) {
                // this.conversationService.resetConversation(interaction.channel.id);
                await interaction.update({ content: RESET_MESSAGE_CONTENT, components: [] });
            }
        }

        if (interaction.customId.startsWith("list-")) {
            const currentPage = parseInt(interaction.customId.split("-")[2]);
            const newReply = await this.generateListReply(currentPage, interaction.channel as TextChannel);
            await (interaction as ButtonInteraction).update(newReply);
        }

        if (interaction.customId.startsWith("prev-greeting-") || interaction.customId.startsWith("next-greeting-")) {
            if (!interaction.isButton()) return;

            const [_, __, characterName, greetingIndexStr] = interaction.customId.split("-");
            const greetingIndex = parseInt(greetingIndexStr);

            const character = this.characterService.getCharacter(characterName);
            if (!character) {
                await interaction.reply({ content: "Character not found.", ephemeral: true });
                return;
            }

            const greetings = [character.card.first_mes, ...(character.card.alternate_greetings || [])];
            if (greetingIndex < 0 || greetingIndex >= greetings.length) {
                await interaction.reply({ content: "Invalid greeting index.", ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setAuthor({ name: character.card.name })
                .setThumbnail(character.avatarUrl ?? null)
                .setColor(0x5865F2)
                .setDescription(
                    this.fixGreeting(greetings[greetingIndex], interaction.user.displayName, characterName),
                );

            const actionRow = this.componentService.createIntroActionRow(
                characterName,
                greetingIndex,
                greetings.length,
            );

            await interaction.update({ embeds: [embed], components: [actionRow] });
        }
    }

    private fixGreeting(greeting: string, displayName: string, characterName: string) {
        return greeting.replaceAll("{{user}}", displayName).replaceAll("{{char}}", characterName);
    }

    private async handleSwitchCommand(interaction: ChatInputCommandInteraction) {
        const characterName = interaction.options.getString("character");
        const showIntro = interaction.options.getBoolean("intro") ?? true;

        if (characterName) {
            const character = this.characterService.getCharacter(characterName);
            if (!character) {
                const availableChars = this.characterService.getCharacters().map((c) => c.card.name).join(", ");
                await interaction.reply(
                    `Character "${characterName}" not found. Available characters: ${availableChars}`,
                );
                return;
            }

            if (interaction.channel?.type === ChannelType.DM && showIntro) {
                const greetings = [character.card.first_mes, ...(character.card.alternate_greetings || [])];
                const embed = new EmbedBuilder()
                    .setAuthor({ name: characterName })
                    .setThumbnail(character.avatarUrl ?? null)
                    .setColor(0x5865F2)
                    .setDescription(this.fixGreeting(greetings[0], interaction.user.displayName, characterName));

                const actionRow = this.componentService.createIntroActionRow(character.card.name, 0, greetings.length);
                await interaction.reply({ embeds: [embed], components: [actionRow] });
            } else {
                const replyContent = interaction.channel?.type === ChannelType.DM
                    ? `Switched to ${characterName}\nYou may wish to /reset.`
                    : `Switched to ${characterName}`;
                await interaction.reply(replyContent);
            }
        } else {
            // New dropdown format
            const characters = this.characterService.getCharacters().filter((c) =>
                c.card.name !== configService.getAssistantName()
            );
            const currentCharacter = interaction.channel?.type === ChannelType.DM
                ? null
                : await this.characterService.inferCharacterFromHistory(interaction.channel);
            const selectMenu = this.componentService.createCharacterSelectMenu(
                characters,
                currentCharacter,
            );
            await interaction.reply({
                content: "Select a character to switch to:",
                components: [selectMenu],
            });
        }
    }

    private async handleResetCommand(interaction: ChatInputCommandInteraction) {
        const confirmButton = new ButtonBuilder()
            .setCustomId("confirm-reset")
            .setLabel("Confirm Reset")
            .setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);
        await interaction.reply({
            content: "Are you sure you want to reset the conversation history?",
            components: [row],
        });
    }

    private async handleListCommand(interaction: ChatInputCommandInteraction, page: number) {
        const reply = await this.generateListReply(page, interaction.channel);
        await interaction.reply({ ...reply, flags: [64] });
    }

    private async fetchMessageHistory(
        channel: TextBasedChannel,
        beforeId?: string,
        includeMessage?: Message,
    ): Promise<Message[]> {
        const allMessages: Message[] = [];
        let lastMessageId: string | undefined = beforeId;
        let foundReset = false;
        const maxMessages = configService.getMaxHistoryMessages();
        const batchSize = 100;

        if (includeMessage) {
            allMessages.push(includeMessage);
        }

        while (allMessages.length < maxMessages && !foundReset) {
            const fetchOptions: { limit: number; before?: string } = {
                limit: batchSize,
                before: lastMessageId,
            };

            const batch = await channel.messages.fetch(fetchOptions);
            const batchArray = Array.from(batch.values());

            if (batchArray.length === 0) {
                break;
            }

            batchArray.reverse();

            let resetIndex = -1;
            for (let i = 0; i < batchArray.length; i++) {
                const msg = batchArray[i];
                if (msg.content.includes(RESET_MESSAGE_CONTENT)) {
                    foundReset = true;
                    resetIndex = i;
                    break;
                }
            }

            if (foundReset && resetIndex !== -1) {
                const messagesAfterReset = batchArray.slice(resetIndex + 1);
                allMessages.unshift(...messagesAfterReset);
            } else {
                allMessages.unshift(...batchArray);
            }

            lastMessageId = batchArray[0].id;

            if (allMessages.length >= maxMessages) {
                allMessages.splice(0, allMessages.length - maxMessages);
                break;
            }
        }

        return allMessages;
    }

    private async handleReroll(interaction: ButtonInteraction, message: Message, logContext: string) {
        this.logger.info(`${logContext} Re-rolling message ID ${message.id}...`);

        let typingInterval: number | undefined;
        const channel = message.channel;
        if (channel.isTextBased() && "sendTyping" in channel) {
            await channel.sendTyping();
            typingInterval = setInterval(() => {
                channel.sendTyping();
            }, 9000);
        }

        const actionRow = this.componentService.createActionRow(true);

        if (message.webhookId) {
            await interaction.update({ components: [actionRow] });
        } else if (message.embeds.length > 0) {
            const originalEmbed = new EmbedBuilder(message.embeds[0].toJSON());
            const newEmbed = originalEmbed.setFooter({ text: "Generating..." });
            await interaction.update({ embeds: [newEmbed], components: [actionRow] });
        } else {
            await interaction.update({
                content: `${message.content}\n\n> Generating...`,
                components: [actionRow],
            });
        }

        try {
            this.logger.info(`${logContext} Fetching message history for re-roll...`);
            const messages = await this.fetchMessageHistory(message.channel, message.id);
            this.logger.info(`${logContext} Fetched ${messages.length} messages for re-roll`);

            let character = null;
            if (message.webhookId) {
                character = this.characterService.getCharacter(message.author.username);
                if (!character) {
                    this.logger.warn(
                        `Could not find character for webhook message re-roll: ${message.author.username}`,
                    );
                }
            } else if (message.embeds.length > 0 && (message.embeds[0].author?.name || message.embeds[0].title)) {
                character = this.characterService.getCharacter(
                    message.embeds[0].author?.name || message.embeds[0].title!,
                );
            } else if (interaction.channel?.type === ChannelType.DM) {
                character = await this.characterService.inferCharacterFromHistory(interaction.channel);
            }
            this.logger.info(`${logContext} Using character for re-roll: ${character ? character.card.name : "none"}`);

            this.logger.info(`${logContext} Generating new response...`);
            const isSFW = message.channel.type !== ChannelType.DM &&
                "nsfw" in message.channel &&
                !message.channel.nsfw;
            const result = ((await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService) as any,
                this.client,
                messages,
                configService.botSelfId!,
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
                false, // continuation
                false, // sanitize
                isSFW,
            )) as any)
                .text();

            if (!result) {
                await this.sendEphemeralError(
                    interaction,
                    "Oops! It seems my response was blocked. This can happen for a variety of reasons, including if a message goes against our terms of service. You could try deleting your last message and rephrasing, re-rolling the last character message, or use the `/reset` command to clear our conversation and start fresh.",
                );
                return;
            }

            const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const nameToRemove = character ? character.card.name : "Assistant";
            const nameRegex = new RegExp(`^${escapeRegex(nameToRemove)}:\\s*`, "i");
            let reply = result.replace(nameRegex, "");
            reply = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

            let finalContent = reply;
            if (message.guild) {
                const url = `https://discord.com/users/${interaction.user.id}`;
                const link = hyperlink(`Generated by ${interaction.user.displayName}`, hideLinkEmbed(url));
                finalContent = `${reply}\n${link}`;
            }

            const webhookManager = this.webhookManager;
            if (message.webhookId && webhookManager && character) {
                await webhookManager.editAsCharacter(message, character, finalContent, {
                    components: [this.componentService.createActionRow()],
                });
            } else if (webhookManager && character && message.guild) {
                await webhookManager.sendAsCharacter(
                    message.channel as TextChannel,
                    character,
                    finalContent,
                    { components: [this.componentService.createActionRow()] },
                    message,
                    interaction.user,
                );
                await message.delete();
            } else {
                if (message.embeds.length > 0) {
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: character ? character.card.name : "Assistant" })
                        .setThumbnail(character?.avatarUrl ?? null)
                        .setColor(0x5865F2)
                        .setDescription(reply);
                    await message.edit({ embeds: [embed], components: [this.componentService.createActionRow()] });
                } else {
                    await message.edit({
                        content: finalContent,
                        components: [this.componentService.createActionRow()],
                    });
                }
            }
            this.logger.info(`${logContext} Re-roll successful for message ID ${message.id}`);
        } catch (error) {
            this.logger.error(`${logContext} Failed to re-roll response for message ID ${message.id}:`);
            console.log(error);
        } finally {
            clearInterval(typingInterval);
            const fetchedMessage = await message.channel.messages.fetch(message.id).catch(() => null);
            if (fetchedMessage) {
                if (fetchedMessage.webhookId) {
                    const character = this.characterService.getCharacter(fetchedMessage.author.username);
                    const webhookManager = this.webhookManager;
                    if (character && webhookManager) {
                        await webhookManager.editAsCharacter(fetchedMessage, character, fetchedMessage.content, {
                            components: [this.componentService.createActionRow(false)],
                        });
                    }
                } else if (fetchedMessage.embeds.length > 0) {
                    const originalEmbed = new EmbedBuilder(fetchedMessage.embeds[0].toJSON());
                    const newEmbed = originalEmbed.setFooter(null);
                    await fetchedMessage.edit({
                        embeds: [newEmbed],
                        components: [this.componentService.createActionRow(false)],
                    });
                } else {
                    await fetchedMessage.edit({
                        content: fetchedMessage.content.replace(/\n\n> Generating.../, ""),
                        components: [this.componentService.createActionRow(false)],
                    });
                }
            }
        }
    }

    private async sendEphemeralError(interaction: ButtonInteraction, content: string) {
        try {
            await interaction.followUp({
                content,
                flags: [64],
            });
        } catch (e) {
            this.logger.error("Failed to send ephemeral error message:");
            console.log(e);
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
