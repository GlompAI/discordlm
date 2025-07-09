import { unzlibSync } from "fflate";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export interface CharacterCardV2 {
    spec: "chara_card_v2";
    spec_version: "2.0";
    data: {
        name: string;
        description: string;
        personality: string;
        scenario: string;
        first_mes: string;
        mes_example: string;
        creator_notes: string;
        system_prompt: string;
        post_history_instructions: string;
        alternate_greetings: string[];
        character_book?: {
            name: string;
            description: string;
            scan_depth: number;
            token_budget: number;
            recursive_scanning: boolean;
            extensions: Record<string, unknown>;
            entries: {
                keys: string[];
                content: string;
                extensions: Record<string, unknown>;
                enabled: boolean;
                insertion_order: number;
                case_sensitive: boolean;
                name: string;
                priority: number;
                id: string;
                comment: string;
                selective: boolean;
                secondary_keys: string[];
                constant: boolean;
            }[];
        };
        tags: string[];
        creator: string;
        character_version: string;
        extensions: Record<string, unknown>;
    };
}

export interface CharacterCardV3 {
    spec: "chara_card_v3";
    spec_version: "3.0";
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
}

export interface CharacterCard {
    char_name: string;
    char_persona: string;
    world_scenario: string;
    char_greeting: string;
    example_dialogue: string;
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    alternate_greetings?: string[];
    metadata?: {
        version?: number;
        created?: number;
        modified?: number;
        source?: string | null;
        tool?: {
            name?: string;
            version?: string;
            url?: string;
        };
    };
}

export interface CharacterConfig {
    card: CharacterCard;
    avatarUrl?: string;
    filename: string;
}

function normalizeCard(card: Partial<CharacterCard | CharacterCardV2 | CharacterCardV3>): CharacterCard {
    const normalized: Partial<CharacterCard> = {};

    if ("spec" in card) {
        const v2Data = card.spec === "chara_card_v2" ? (card as CharacterCardV2).data : undefined;
        const v3Data = card.spec === "chara_card_v3" ? (card as CharacterCardV3) : undefined;

        const coalesce = (s1: string | undefined, s2: string | undefined) => (s1?.trim() ? s1 : (s2?.trim() ? s2 : s1));

        normalized.name = coalesce(v2Data?.name, v3Data?.name);
        normalized.description = coalesce(v2Data?.description, v3Data?.description);
        normalized.personality = coalesce(v2Data?.personality, v3Data?.personality);
        normalized.scenario = coalesce(v2Data?.scenario, v3Data?.scenario);
        normalized.first_mes = coalesce(v2Data?.first_mes, v3Data?.first_mes);
        normalized.mes_example = coalesce(v2Data?.mes_example, v3Data?.mes_example);
        normalized.alternate_greetings = v2Data?.alternate_greetings;
    } else {
        Object.assign(normalized, card);
    }

    // Ensure both name and char_name are present
    if (normalized.name && !normalized.char_name) {
        normalized.char_name = normalized.name;
    } else if (normalized.char_name && !normalized.name) {
        normalized.name = normalized.char_name;
    }

    // Ensure other fields are at least empty strings
    normalized.description ??= "";
    normalized.personality ??= "";
    normalized.scenario ??= "";
    normalized.first_mes ??= "";
    normalized.mes_example ??= "";
    normalized.char_persona ??= normalized.personality;
    normalized.world_scenario ??= normalized.scenario;
    normalized.char_greeting ??= normalized.first_mes;
    normalized.example_dialogue ??= normalized.mes_example;

    return normalized as CharacterCard;
}

/**
 * Extract character card data from PNG metadata
 * Character cards are typically stored in PNG tEXt chunks with key "chara"
 */
export async function parseCharacterCardFromPNG(filePath: string): Promise<CharacterCard | null> {
    try {
        const fileData = await Deno.readFile(filePath);

        // Look for PNG tEXt chunks containing character data
        // PNG format: signature (8 bytes) + chunks
        let offset = 8; // Skip PNG signature

        while (offset < fileData.length - 8) {
            // Read chunk length (4 bytes, big endian)
            const chunkLength = new DataView(fileData.buffer, offset, 4).getUint32(0, false);
            offset += 4;

            // Read chunk type (4 bytes)
            const chunkType = new TextDecoder().decode(fileData.slice(offset, offset + 4));
            offset += 4;

            if (chunkType === "tEXt") {
                // Read chunk data
                const chunkData = fileData.slice(offset, offset + chunkLength);
                const nullIndex = chunkData.indexOf(0); // Find the null separator in the byte array

                if (nullIndex > -1) {
                    const keyword = new TextDecoder().decode(chunkData.slice(0, nullIndex));
                    if (keyword === "chara") {
                        try {
                            const text = new TextDecoder().decode(chunkData.slice(nullIndex + 1));
                            try {
                                // First, try to decode from Base64
                                const decodedData = decodeBase64(text);
                                const jsonString = new TextDecoder().decode(decodedData);
                                const card = JSON.parse(jsonString);
                                // Check if it's a V2/V3 card and adapt it
                                if (card.spec === "chara_card_v2" || card.spec === "chara_card_v3") {
                                    return card;
                                }
                                return card as CharacterCard;
                            } catch {
                                // If that fails, try to parse as plain JSON
                                return JSON.parse(text) as CharacterCard;
                            }
                        } catch (e) {
                            console.warn(`Failed to parse character data from ${filePath}:`, e);
                        }
                    }
                }
            } else if (chunkType === "zTXt" || chunkType === "iTXt") {
                // Read chunk data
                const chunkData = fileData.slice(offset, offset + chunkLength);
                let i = 0;

                // Find null separator for keyword
                const nullIndex = chunkData.indexOf(0, i);
                if (nullIndex > -1) {
                    const keyword = new TextDecoder().decode(chunkData.slice(i, nullIndex));
                    i = nullIndex + 1;

                    if (keyword === "chara") {
                        try {
                            let textData: Uint8Array;

                            if (chunkType === "zTXt") {
                                // zTXt: compressed data
                                const compressedData = chunkData.slice(i + 1); // Skip compression method byte
                                textData = unzlibSync(compressedData);
                            } else {
                                // iTXt: international text
                                const compressionFlag = chunkData[i];
                                i++;
                                const compressionMethod = chunkData[i];
                                i++;

                                const langTagNull = chunkData.indexOf(0, i);
                                i = langTagNull + 1;
                                const transKeyNull = chunkData.indexOf(0, i);
                                i = transKeyNull + 1;

                                textData = chunkData.slice(i);

                                if (compressionFlag === 1) {
                                    if (compressionMethod === 0) {
                                        textData = unzlibSync(textData);
                                    } else {
                                        console.warn(
                                            `Unsupported compression method in iTXt chunk: ${compressionMethod}`,
                                        );
                                        continue;
                                    }
                                }
                            }

                            const text = new TextDecoder("utf-8").decode(textData);
                            const card = JSON.parse(text);

                            // Check if it's a V2/V3 card and adapt it
                            if (card.spec === "chara_card_v2" || card.spec === "chara_card_v3") {
                                return card;
                            }
                            return card as CharacterCard;
                        } catch (e) {
                            console.warn(`Failed to parse character data from ${filePath}:`, e);
                        }
                    }
                }
            }

            // Skip chunk data and CRC (4 bytes)
            offset += chunkLength + 4;
        }

        return null;
    } catch (error) {
        console.error(`Error reading PNG file ${filePath}:`, error);
        return null;
    }
}

/**
 * Parse character card data from JSON file
 */
export async function parseCharacterCardFromJSON(filePath: string): Promise<CharacterCard | null> {
    try {
        const rawData = await Deno.readFile(filePath);
        const fileData = new TextDecoder("utf-8").decode(rawData);
        const card = JSON.parse(fileData) as CharacterCard;

        // Validate required fields
        if (card.name || card.char_name) {
            return card;
        } else {
            console.warn(`Invalid character card in ${filePath}: missing name field`);
            return null;
        }
    } catch (error) {
        console.error(`Error reading JSON file ${filePath}:`, error);
        return null;
    }
}

/**
 * Load all character cards from the characters directory
 */
export async function loadCharacterCards(
    charactersDir: string = "./characters",
    avatarBaseUrl?: string,
): Promise<CharacterConfig[]> {
    // Resolve the absolute path to handle binary execution from different directories
    const resolvedDir = new URL(charactersDir, `file://${Deno.cwd()}/`).pathname;
    const characters: CharacterConfig[] = [];

    try {
        const entries = Deno.readDir(resolvedDir);

        for await (const entry of entries) {
            if (entry.isFile && !entry.name.startsWith("._")) {
                const filePath = `${resolvedDir}/${entry.name}`;
                let card: CharacterCard | null = null;
                let avatarUrl: string | undefined;

                if (entry.name.toLowerCase().endsWith(".png")) {
                    card = await parseCharacterCardFromPNG(filePath);
                    // For PNG files, use the PNG file itself as the avatar
                    avatarUrl = avatarBaseUrl ? `${avatarBaseUrl}/avatars/${encodeURIComponent(entry.name)}` : filePath;
                } else if (entry.name.toLowerCase().endsWith(".json")) {
                    card = await parseCharacterCardFromJSON(filePath);
                    // For JSON files, look for a corresponding PNG file with the same base name
                    const baseName = entry.name.substring(0, entry.name.lastIndexOf("."));
                    const pngPath = `${resolvedDir}/${baseName}.png`;
                    try {
                        await Deno.stat(pngPath);
                        avatarUrl = avatarBaseUrl
                            ? `${avatarBaseUrl}/avatars/${encodeURIComponent(baseName)}.png`
                            : pngPath;
                    } catch {
                        // No corresponding PNG file found, that's okay
                    }
                }

                if (card) {
                    const normalizedCard = normalizeCard(card);
                    characters.push({
                        card: normalizedCard,
                        filename: entry.name,
                        avatarUrl,
                    });
                    console.log(`[DEBUG] Loaded character ${normalizedCard.name} with avatarUrl: ${avatarUrl}`);
                } else if (entry.name.toLowerCase().endsWith(".png") || entry.name.toLowerCase().endsWith(".json")) {
                    console.warn(`No character data found in ${entry.name}`);
                }
            }
        }
    } catch (error) {
        console.error(`Error loading characters from ${resolvedDir}:`, error);
    }

    return characters;
}

/**
 * Get a character by name (case insensitive)
 */
export function getCharacterByName(characters: CharacterConfig[], name: string): CharacterConfig | null {
    const normalized = name.toLowerCase().trim();
    return characters.find((char) =>
        (char.card.name && char.card.name.toLowerCase() === normalized) ||
        (char.card.char_name && char.card.char_name.toLowerCase() === normalized)
    ) || null;
}
