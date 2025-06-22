import {
    ApplicationCommandType,
    ChannelType,
    Client,
    Collection,
    CommandInteraction,
    Events,
    GatewayIntentBits,
    Message,
    OmitPartialGroupDMChannel,
    Partials,
    SlashCommandBuilder,
    TextChannel,
} from "npm:discord.js";
import { load } from "dotenv";

import { Queue } from "./queue.ts";

import adze, { setup } from "npm:adze";
import { generateMessage } from "./llm.ts";
import {
    getAvatarServerPort,
    getBotSelfId,
    getBotToken,
    getInferenceParallelism,
    getPublicAvatarBaseUrl,
    isAvatarServerEnabled,
} from "./env.ts";
import { CharacterManager } from "./CharacterManager.ts";
import { WebhookManager } from "./WebhookManager.ts";
import { AvatarServer } from "./AvatarServer.ts";

await load({ export: true });

console.log("=== DISCORD BOT STARTING ===");
console.log("Setting up adze logging...");
setup();
const logger = adze.withEmoji.timestamp.seal();
console.log("Adze logging setup complete");

console.log("Creating Discord client...");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});
console.log("Discord client created");

// Initialize character and webhook managers
console.log("Initializing character manager...");
const characterManager = new CharacterManager();
let webhookManager: WebhookManager;
let avatarServer: AvatarServer | null = null;
const inferenceQueue = new Queue(getInferenceParallelism());
console.log("Character manager initialized");

// Note: Avatar server configuration is now handled via environment functions

logger.log(`Starting bot with environment:`);
logger.log(`- BOT_SELF_ID: ${Deno.env.get("BOT_SELF_ID") ? "[SET]" : "[NOT SET]"}`);
logger.log(`- BOT_TOKEN: ${Deno.env.get("BOT_TOKEN") ? "[SET]" : "[NOT SET]"}`);
logger.log(`- OPENAI_URL: ${Deno.env.get("OPENAI_URL") || "[NOT SET]"}`);
logger.log(`- MODEL_NAME: ${Deno.env.get("MODEL_NAME") || "[NOT SET]"}`);
logger.log(`- OPENAI_KEY: ${Deno.env.get("OPENAI_KEY") ? "[SET]" : "[NOT SET]"}`);
logger.log(`- ENABLE_AVATAR_SERVER: ${isAvatarServerEnabled()}`);
logger.log(`- AVATAR_PORT: ${getAvatarServerPort()}`);
logger.log(`- PUBLIC_AVATAR_BASE_URL: ${getPublicAvatarBaseUrl() || "[NOT SET]"}`);
logger.log(`Working directory: ${Deno.cwd()}`);

try {
    const stat = await Deno.stat("./characters");
    logger.log(`Characters directory exists: ${stat.isDirectory ? "YES (directory)" : "NO (not a directory)"}`);
} catch {
    logger.log(`Characters directory exists: NO`);
}

client.once(Events.ClientReady, async (readyClient) => {
    logger.log(`Ready! Logged in as ${readyClient.user.tag}`);
    logger.log(`Current working directory: ${Deno.cwd()}`);
    logger.log(`Avatar server enabled: ${isAvatarServerEnabled()}`);
    logger.log(`Avatar port: ${getAvatarServerPort()}`);

    // Determine avatar base URL (prefer public URL, fall back to local)
    let avatarBaseUrl: string | undefined;
    const publicAvatarBaseUrl = getPublicAvatarBaseUrl();

    if (publicAvatarBaseUrl) {
        // Use public avatar base URL if configured
        avatarBaseUrl = publicAvatarBaseUrl;
        logger.log(`Using public avatar base URL: ${avatarBaseUrl}`);
    }

    // Start local avatar server if enabled
    if (isAvatarServerEnabled()) {
        logger.log(`Starting local avatar server...`);
        avatarServer = new AvatarServer(getAvatarServerPort());
        await avatarServer.start();

        // Only use local URL if no public URL is configured
        if (!publicAvatarBaseUrl) {
            avatarBaseUrl = `http://localhost:${getAvatarServerPort()}`;
            logger.log(`Local avatar server started with base URL: ${avatarBaseUrl}`);
        } else {
            logger.log(
                `Local avatar server started on port ${getAvatarServerPort()} (proxied via ${publicAvatarBaseUrl})`,
            );
        }
    }

    // Load characters
    logger.log(`Loading characters from ./characters with avatar base URL: ${avatarBaseUrl}`);
    await characterManager.loadCharacters("./characters", avatarBaseUrl);
    logger.log(`Character loading completed`);

    // Initialize webhook manager
    logger.log(`Initializing webhook manager...`);
    webhookManager = new WebhookManager(client, characterManager.getCharacters());
    logger.log(`Webhook manager initialized`);

    // Register slash commands
    logger.log(`Registering slash commands...`);
    await registerSlashCommands(readyClient);
    logger.log(`Slash commands registered`);

    logger.log(`Character system ready with ${characterManager.getCharacters().length} characters`);
    if (isAvatarServerEnabled()) {
        const publicUrl = getPublicAvatarBaseUrl();
        if (publicUrl) {
            logger.log(`Avatar server enabled at ${publicUrl} (local port: ${getAvatarServerPort()})`);
        } else {
            logger.log(`Avatar server enabled at http://localhost:${getAvatarServerPort()}`);
        }
    }
    logger.log(`Bot startup complete!`);
});

logger.log(`Getting bot credentials...`);
const BOT_SELF_ID = getBotSelfId();
logger.log(`Bot self ID retrieved: ${BOT_SELF_ID}`);
const BOT_TOKEN = getBotToken();
logger.log(`Bot token retrieved: [REDACTED]`);

logger.log(`Setting up event handlers...`);

client.on(Events.MessageCreate, onMessageCreate(BOT_SELF_ID, characterManager, () => webhookManager));
client.on(Events.InteractionCreate, onInteractionCreate(characterManager, () => webhookManager));

const shutdown = async () => {
    try {
        if (avatarServer) {
            await avatarServer.stop();
        }
        if (webhookManager) {
            await webhookManager.cleanup();
        }
        await client.destroy();
    } catch (e) {
        logger.error(e);
    }
    Deno.exit();
};
// Graceful shutdown of network clients
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);
// Start bots
logger.log(`Attempting to login to Discord...`);
try {
    await client.login(BOT_TOKEN);
    logger.log(`Discord login successful`);
} catch (error) {
    logger.error(`Discord login failed:`, error);
    Deno.exit(1);
}

export function smartSplit(text: string, maxLength = 1980) {
    if (text.length <= maxLength) {
        return [text];
    }

    const parts: string[] = [];
    let currentPart = "";

    // Split by lines to respect paragraphs
    const lines = text.split("\n");
    let codeBlockFence: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Handle code blocks
        if (line.startsWith("```")) {
            if (codeBlockFence) {
                // End of code block
                codeBlockFence = null;
            } else {
                // Start of code block
                codeBlockFence = line.trim();
            }
        }

        // If adding the next line exceeds maxLength, push the current part
        if (currentPart.length + line.length + 1 > maxLength) {
            // If we are in a code block, we must close it
            if (codeBlockFence) {
                currentPart += "\n```";
            }
            parts.push(currentPart);
            currentPart = "";
            // If we were in a code block, we must re-open it
            if (codeBlockFence) {
                currentPart = codeBlockFence + "\n";
            }
        }

        // Add the line to the current part
        if (currentPart.length > 0) {
            currentPart += "\n";
        }
        currentPart += line;
    }

    // Add the last part
    parts.push(currentPart);

    // Further split any parts that are still too long (e.g., single long lines)
    const finalParts: string[] = [];
    for (const part of parts) {
        if (part.length > maxLength) {
            // Simple character-based split for oversized parts
            for (let i = 0; i < part.length; i += maxLength) {
                finalParts.push(part.substring(i, i + maxLength));
            }
        } else {
            finalParts.push(part);
        }
    }

    return finalParts;
}

async function registerSlashCommands(client: Client) {
    const commands = [
        new SlashCommandBuilder()
            .setName("switch")
            .setDescription("Switch to a different character")
            .addStringOption((option) =>
                option.setName("character")
                    .setDescription("The character to switch to")
                    .setRequired(true)
                    .setAutocomplete(true)
            ),
        new SlashCommandBuilder()
            .setName("list")
            .setDescription("List all available characters"),
    ];

    try {
        await client.application?.commands.set(commands);
        logger.info("Successfully registered slash commands");
    } catch (error) {
        logger.error("Failed to register slash commands:", error);
    }
}

function onInteractionCreate(characterManager: CharacterManager, getWebhookManager: () => WebhookManager) {
    return async (interaction: any) => {
        if (interaction.isAutocomplete()) {
            // Handle autocomplete for character names
            if (interaction.commandName === "switch") {
                const focusedValue = interaction.options.getFocused();
                const characters = characterManager.getCharacters();
                const filtered = characters.filter((char) =>
                    char.card.name.toLowerCase().startsWith(focusedValue.toLowerCase())
                ).slice(0, 25); // Discord limits to 25 choices

                await interaction.respond(
                    filtered.map((char) => ({ name: char.card.name, value: char.card.name })),
                );
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

            const character = characterManager.getCharacter(characterName!);

            if (character) {
                characterManager.setChannelCharacter(channelId, characterName!);
                await interaction.reply(`Switched to ${character.card.name}`);
            } else {
                const availableChars = characterManager.getCharacters().map((c) => c.card.name).join(", ");
                await interaction.reply(
                    `Character "${characterName}" not found. Available characters: ${availableChars}`,
                );
            }
        } else if (commandName === "list") {
            const channelId = interaction.channel?.id;
            if (!channelId) {
                await interaction.reply({ content: "Command can only be used in channels.", ephemeral: true });
                return;
            }

            const currentChar = characterManager.getChannelCharacter(channelId);
            const charList = characterManager.getCharacters().map((c) =>
                c === currentChar ? `**${c.card.name}** (current)` : c.card.name
            ).join(", ");

            await interaction.reply({
                content: `Available characters: ${charList}`,
                ephemeral: true,
            });
        }
    };
}

function onMessageCreate(botId: string, characterManager: CharacterManager, getWebhookManager: () => WebhookManager) {
    return async (message: OmitPartialGroupDMChannel<Message>) => {
        // If the message is from a regular bot (not webhook), ignore it
        // But allow webhook messages to be processed
        if (message.author.bot && !message.webhookId) {
            return;
        }

        // Check if this message mentions the bot or is a reply to a webhook message
        const mentionsBot = message.mentions.has(botId);
        const isDM = message.channel.type === ChannelType.DM;

        // Check if this is a reply to a webhook message
        let repliesToWebhookCharacter = false;
        let targetCharacterName = "";

        if (message.reference && message.reference.messageId) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.webhookId) {
                    // This is a reply to a webhook message
                    // The webhook's username should be the character name
                    targetCharacterName = (repliedMessage as any).author?.username || "";
                    repliesToWebhookCharacter = true;
                }
            } catch (error) {
                // Failed to fetch replied message, ignore
            }
        }

        // Also check if any character name is explicitly mentioned in the message content
        let mentionsCharacterByName = false;
        const characters = characterManager.getCharacters();
        for (const char of characters) {
            // Check if the character name is mentioned in the message content
            const characterNameRegex = new RegExp(`@${char.card.name}\\b`, "i");
            if (characterNameRegex.test(message.content)) {
                mentionsCharacterByName = true;
                targetCharacterName = char.card.name;
                break;
            }
        }

        const shouldProcess = mentionsBot || repliesToWebhookCharacter || mentionsCharacterByName || isDM;

        if (!shouldProcess) {
            return;
        }

        // Get the current character for this channel
        let character = characterManager.getChannelCharacter(message.channel.id);

        // If this message is specifically targeted at a character, only respond if it's the active character
        if ((repliesToWebhookCharacter || mentionsCharacterByName) && !mentionsBot) {
            if (targetCharacterName !== character?.card.name) {
                // This message is for a different character, not the active one
                // Switch to the new character
                const newCharacter = characterManager.getCharacter(targetCharacterName);
                if (newCharacter) {
                    characterManager.setChannelCharacter(message.channel.id, targetCharacterName);
                    character = newCharacter;
                    logger.info(`Switched character to ${targetCharacterName} in channel ${message.channel.id}`);
                } else {
                    return;
                }
            }
        }

        // If no character is available, inform the user
        if (!character) {
            try {
                await message.reply(
                    "No characters available. Please use `/list` to see available characters and `/switch` to select one.",
                );
            } catch (exception) {
                logger.error("Failed to send no character response: " + exception);
            }
            return;
        }

        logger.info(`Using character: ${character.card.name}`);
        logger.info("Fetching message history...");

        const messages = Array.from((await message.channel.messages.fetch({ limit: 100 })).values());
        if (!messages.includes(message)) {
            messages.push(message);
        }
        // Context is reverse on discord for some reason
        messages.reverse();

        let keepTyping = true;
        logger.info("Replying to message...");

        // Send initial typing event
        message.channel.sendTyping();

        // Set up recurring typing events every 5 seconds
        const typingInterval = setInterval(() => {
            if (keepTyping) {
                message.channel.sendTyping();
            }
        }, 5000);

        let reply = "";
        try {
            logger.info("Generating response...");
            const result = (await inferenceQueue.push(generateMessage, client, messages, botId, character.card))
                .completion.choices[0].message.content;
            if (!result) {
                adze.error("Empty response from API");
                return Promise.resolve();
            }
            reply = result;
        } catch (exception) {
            logger.error("Failed to generate response: " + exception);
            console.log(exception);
            keepTyping = false;
            clearInterval(typingInterval);
            return;
        }

        // Stop typing events
        keepTyping = false;
        clearInterval(typingInterval);

        try {
            logger.info("Replying...");

            // Use webhook if possible (only in guild channels), otherwise fall back to regular reply
            const webhookManager = getWebhookManager();
            let useWebhook = false;

            if (
                webhookManager && message.channel instanceof TextChannel &&
                message.channel.type === ChannelType.GuildText
            ) {
                const messageParts = smartSplit(reply);
                for (const part of messageParts) {
                    const success = await webhookManager.sendAsCharacter(
                        message.channel,
                        character,
                        part,
                        undefined,
                        message,
                    );
                    useWebhook = success;
                    if (!success) {
                        // If one part fails, stop sending
                        break;
                    }
                }
            }

            if (!useWebhook) {
                // Fallback to regular reply (for DMs, failed webhooks, or non-guild channels)
                const messageParts = smartSplit(reply);
                for (const part of messageParts) {
                    await message.reply(part);
                }
            }

            logger.info("Reply sent!");
        } catch (exception) {
            logger.error("Failed to reply to message: " + exception);
        }
    };
}
