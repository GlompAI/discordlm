import { CharacterConfig, getCharacterByName, loadCharacterCards } from "./CharacterCard.ts";
import adze from "npm:adze";

const logger = adze.withEmoji.timestamp.seal();

export class CharacterManager {
    private characters: CharacterConfig[] = [];
    private defaultCharacter: CharacterConfig | null = null;
    private channelCharacters = new Map<string, CharacterConfig | null>(); // channelId -> character

    constructor() {}

    /**
     * Load all characters from the characters directory
     */
    async loadCharacters(charactersDir: string = "./characters", avatarBaseUrl?: string): Promise<void> {
        try {
            this.characters = await loadCharacterCards(charactersDir, avatarBaseUrl);
            logger.info(`Loaded ${this.characters.length} characters`);

            // Default character is now null (raw mode) by default.
            // A default can be set later via the setDefaultCharacter method.
        } catch (error) {
            logger.error("Failed to load characters:", error);
        }
    }

    /**
     * Get all available characters
     */
    getCharacters(): CharacterConfig[] {
        return [...this.characters];
    }

    /**
     * Get a character by name
     */
    getCharacter(name: string): CharacterConfig | null {
        return getCharacterByName(this.characters, name);
    }

    /**
     * Set the active character for a specific channel
     */
    setChannelCharacter(channelId: string, characterName: string): boolean {
        if (characterName.toLowerCase() === "none" || characterName.toLowerCase() === "raw") {
            this.channelCharacters.set(channelId, null);
            logger.info(`Set channel ${channelId} to raw mode (no character).`);
            return true;
        }
        const character = this.getCharacter(characterName);
        if (character) {
            this.channelCharacters.set(channelId, character);
            logger.info(`Set character for channel ${channelId} to: ${character.card.name}`);
            return true;
        }
        return false;
    }

    /**
     * Get the active character for a channel (or default if not set)
     */
    getChannelCharacter(channelId: string): CharacterConfig | null {
        if (this.channelCharacters.has(channelId)) {
            return this.channelCharacters.get(channelId) as CharacterConfig | null;
        }
        return this.defaultCharacter;
    }

    /**
     * Set the default character
     */
    setDefaultCharacter(characterName: string): boolean {
        const character = this.getCharacter(characterName);
        if (character) {
            this.defaultCharacter = character;
            logger.info(`Set default character to: ${character.card.name}`);
            return true;
        }
        return false;
    }

    /**
     * Reload characters from disk
     */
    async reloadCharacters(charactersDir: string = "./characters", avatarBaseUrl?: string): Promise<void> {
        const oldCount = this.characters.length;
        await this.loadCharacters(charactersDir, avatarBaseUrl);
        logger.info(`Reloaded characters: ${oldCount} -> ${this.characters.length}`);
    }
}
