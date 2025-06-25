import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { CharacterConfig } from "../CharacterCard.ts";

export class ComponentService {
    public createActionRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("reroll")
                    .setLabel("Reroll")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("♻️")
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId("delete")
                    .setLabel("Delete")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("❌")
                    .setDisabled(disabled),
            );
        return row;
    }

    public createCharacterSelectMenu(
        characters: CharacterConfig[],
        currentCharacter?: CharacterConfig | null,
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const options = characters.map((char) => {
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(char.card.name)
                .setValue(char.card.name);
            if (char.avatarUrl) {
                // Not officially supported, but some clients might render it.
                // option.setEmoji(char.avatarUrl);
            }
            if (char === currentCharacter) {
                option.setDefault(true);
            }
            return option;
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("character-select")
            .setPlaceholder("Switch character...")
            .addOptions(options.slice(0, 25));

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    }
}

export const componentService = new ComponentService();
