import {
    CharacterConfig,
    getCharacterByName,
    loadCharacterCards,
    parseCharacterCardFromJSON,
    parseCharacterCardFromPNG,
} from "./CharacterCard.ts";
import adze from "npm:adze";
import { resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
import { configService } from "./services/ConfigService.ts";

const logger = adze.withEmoji.timestamp.seal();

export class CharacterManager {
    private characters: CharacterConfig[] = [];
    private defaultCharacter: CharacterConfig | null = null;
    private assistantCharacter: CharacterConfig | null = null;
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
            const allCharacters = await loadCharacterCards(this.charactersDir, this.avatarBaseUrl);
            const assistantName = configService.getAssistantName();
            this.characters = allCharacters.filter((c) => c.card.name !== assistantName);
            logger.info(`Loaded ${this.characters.length} characters`);

            // A default can be set later via the setDefaultCharacter method.
        } catch (error) {
            logger.error("Failed to load characters:", error);
        }
    }

    /**
     * Load the assistant character
     */
    async loadAssistantCharacter(charactersDir: string = "./characters"): Promise<void> {
        try {
            const assistantCardPath = resolve(charactersDir, "Assistant.json");
            const card = await parseCharacterCardFromJSON(assistantCardPath);
            if (card) {
                this.assistantCharacter = { card, filename: "Assistant.json", avatarUrl: undefined };
                logger.info(`Loaded assistant character: ${card.name}`);
            }
        } catch (error) {
            logger.error("Failed to load assistant character:", error);
        }
    }

    /**
     * Get the assistant character
     */
    getAssistantCharacter(): CharacterConfig | null {
        return this.assistantCharacter;
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
        if (this.assistantCharacter && name === this.assistantCharacter.card.name) {
            return this.assistantCharacter;
        }
        return getCharacterByName(this.characters, name);
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
        await this.loadAssistantCharacter(charactersDir);
        logger.info(`Reloaded characters: ${oldCount} -> ${this.characters.length}`);
    }

    /**
     * Watch the characters directory for changes and hot-reload/unload files.
     */
    async watchCharacters() {
        const watcher = Deno.watchFs(this.charactersDir);
        logger.info(`Watching for character changes in ${this.charactersDir}`);
        const assistantName = configService.getAssistantName();

        for await (const event of watcher) {
            for (const path of event.paths) {
                const filename = path.split("/").pop();
                if (!filename || (!filename.endsWith(".png") && !filename.endsWith(".json"))) {
                    continue;
                }

                if (filename === "Assistant.json") {
                    logger.info(`Assistant file ${event.kind}, reloading.`);
                    await this.loadAssistantCharacter(this.charactersDir);
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
            if (card.name === configService.getAssistantName()) {
                logger.info(`Skipping assistant character file during regular load: ${filename}`);
                return;
            }
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
