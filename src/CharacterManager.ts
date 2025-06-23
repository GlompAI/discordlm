import {
    CharacterConfig,
    getCharacterByName,
    loadCharacterCards,
    parseCharacterCardFromJSON,
    parseCharacterCardFromPNG,
} from "./CharacterCard.ts";
import adze from "npm:adze";
import { resolve } from "https://deno.land/std@0.224.0/path/mod.ts";

const logger = adze.withEmoji.timestamp.seal();

export class CharacterManager {
    private characters: CharacterConfig[] = [];
    private defaultCharacter: CharacterConfig | null = null;
    private channelCharacters = new Map<string, CharacterConfig | null>(); // channelId -> character
    private charactersDir: string = "./characters";
    private avatarBaseUrl?: string;

    constructor() {}

    /**
     * Load all characters from the characters directory
     */
    async loadCharacters(charactersDir: string = "./characters", avatarBaseUrl?: string): Promise<void> {
        this.charactersDir = charactersDir;
        this.avatarBaseUrl = avatarBaseUrl;
        try {
            this.characters = await loadCharacterCards(this.charactersDir, this.avatarBaseUrl);
            logger.info(`Loaded ${this.characters.length} characters`);

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

    /**
     * Watch the characters directory for changes and hot-reload/unload files.
     */
    async watchCharacters() {
        const watcher = Deno.watchFs(this.charactersDir);
        logger.info(`Watching for character changes in ${this.charactersDir}`);

        for await (const event of watcher) {
            for (const path of event.paths) {
                const filename = path.split("/").pop();
                if (!filename || (!filename.endsWith(".png") && !filename.endsWith(".json"))) {
                    continue;
                }

                switch (event.kind) {
                    case "create":
                        logger.info(`New character file detected: ${filename}`);
                        await this.loadOrUpdateCharacter(path, filename);
                        break;
                    case "modify":
                        logger.info(`Character file modified: ${filename}`);
                        await this.loadOrUpdateCharacter(path, filename);
                        break;
                    case "remove":
                        logger.info(`Character file removed: ${filename}`);
                        this.removeCharacter(filename);
                        break;
                }
            }
        }
    }

    private async loadOrUpdateCharacter(filePath: string, filename: string) {
        const resolvedPath = resolve(filePath);
        let card;
        let avatarUrl;

        if (filename.toLowerCase().endsWith(".png")) {
            card = await parseCharacterCardFromPNG(resolvedPath);
            avatarUrl = this.avatarBaseUrl
                ? `${this.avatarBaseUrl}/avatars/${encodeURIComponent(filename)}`
                : `file://${resolvedPath}`;
        } else if (filename.toLowerCase().endsWith(".json")) {
            card = await parseCharacterCardFromJSON(resolvedPath);
            const baseName = filename.substring(0, filename.lastIndexOf("."));
            const pngPath = `${this.charactersDir}/${baseName}.png`;
            try {
                await Deno.stat(pngPath);
                avatarUrl = this.avatarBaseUrl
                    ? `${this.avatarBaseUrl}/avatars/${encodeURIComponent(baseName)}.png`
                    : `file://${resolve(pngPath)}`;
            } catch {
                // No corresponding PNG file found
            }
        }

        if (card) {
            const existingIndex = this.characters.findIndex((c) => c.filename === filename);
            const newCharacter: CharacterConfig = { card, filename, avatarUrl };

            if (existingIndex !== -1) {
                this.characters[existingIndex] = newCharacter;
                logger.info(`Updated character: ${card.name}`);
            } else {
                this.characters.push(newCharacter);
                logger.info(`Loaded new character: ${card.name}`);
            }
        }
    }

    private removeCharacter(filename: string) {
        const index = this.characters.findIndex((c) => c.filename === filename);
        if (index !== -1) {
            const characterName = this.characters[index].card.name;
            this.characters.splice(index, 1);
            logger.info(`Unloaded character: ${characterName}`);
        }
    }
}
