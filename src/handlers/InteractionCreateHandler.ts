import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    Interaction,
    TextBasedChannel,
    TextChannel,
} from "npm:discord.js";
import { CharacterService } from "../services/CharacterService.ts";
import { dumpDebug } from "../debug.ts";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { getHelpText } from "../utils.ts";
import adze from "npm:adze";

export class InteractionCreateHandler {
    private readonly logger = adze.withEmoji.timestamp.seal();

    constructor(private readonly characterService: CharacterService) {}

    public async handle(interaction: Interaction): Promise<void> {
        const logContext = interaction.guild
            ? `[Guild: ${interaction.guild.name} | Channel: ${
                (interaction.channel as TextChannel).name
            } | User: ${interaction.user.tag}]`
            : `[DM from ${interaction.user.tag}]`;

        try {
            if (interaction.isAutocomplete()) {
                if (interaction.commandName === "switch") {
                    const focusedValue = interaction.options.getFocused().toLowerCase();
                    const characters = this.characterService.getCharacters();
                    const choices = characters.map((char) => ({ name: char.card.name, value: char.card.name }));

                    const filtered = choices.filter((choice) => choice.name.toLowerCase().startsWith(focusedValue))
                        .slice(0, 25);

                    await interaction.respond(filtered);
                }
                return;
            }

            if (interaction.isMessageComponent()) {
                // Handle button clicks for list pagination
                if (interaction.customId.startsWith("list-")) {
                    const currentPage = parseInt(interaction.customId.split("-")[1]);
                    const newReply = await this.generateListReply(currentPage, interaction.channel as TextChannel);
                    await interaction.update(newReply);
                }
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;

            if (commandName === "switch") {
                const characterName = interaction.options.getString("character");
                const channelId = interaction.channel?.id;

                if (!channelId) {
                    await interaction.reply({ content: "Command can only be used in channels.", ephemeral: true });
                    return;
                }

                const character = this.characterService.getCharacter(characterName!);
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
            } else if (commandName === "list") {
                const page = interaction.options.getInteger("page") || 1;
                await this.handleListCommand(interaction, page);
            } else if (commandName === "reset") {
                await interaction.reply({
                    content: RESET_MESSAGE_CONTENT,
                    ephemeral: false,
                });
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

    private async handleListCommand(interaction: Interaction, page: number) {
        if (!interaction.isChatInputCommand()) return;
        const reply = await this.generateListReply(page, interaction.channel);
        const message = await interaction.reply({ ...reply, ephemeral: true, fetchReply: true });

        const collector = message.createMessageComponentCollector({ time: 60000 });

        let currentPage = page;
        collector.on("collect", async (i) => {
            if (i.customId.startsWith("list-next")) {
                currentPage++;
            } else if (i.customId.startsWith("list-prev")) {
                currentPage--;
            }

            await i.update(await this.generateListReply(currentPage, i.channel));
        });

        collector.on("end", async () => {
            await interaction.editReply({ components: [] });
        });
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
