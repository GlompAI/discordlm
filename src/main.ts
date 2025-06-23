import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    Message,
    MessageReaction,
    PartialMessageReaction,
    Partials,
    PartialUser,
    SlashCommandBuilder,
    TextChannel,
    User,
} from "npm:discord.js";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

import { Queue } from "./queue.ts";

import adze, { setup } from "npm:adze";
import { generateMessage } from "./llm.ts";
import {
    getAdminOverrideId,
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

export const RESET_MESSAGE_CONTENT = "--- Bot conversation history reset ---";

import { dumpDebug } from "./debug.ts";
console.log(`DEBUG environment variable is: ${Deno.env.get("DEBUG")}`);
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
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
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
logger.log(`- MODEL_NAME: ${Deno.env.get("MODEL_NAME") || "[NOT SET]"}`);
logger.log(`- GEMINI_API_KEY: ${Deno.env.get("GEMINI_API_KEY") ? "[SET]" : "[NOT SET]"}`);
logger.log(`- ENABLE_AVATAR_SERVER: ${isAvatarServerEnabled()}`);
logger.log(`- AVATAR_PORT: ${getAvatarServerPort()}`);
logger.log(`- PUBLIC_AVATAR_BASE_URL: ${getPublicAvatarBaseUrl() || "[NOT SET]"}`);
logger.log(`- DEBUG: ${Deno.env.get("DEBUG") || "[NOT SET]"}`);
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

    // Start watching for character changes
    characterManager.watchCharacters();

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

const lastBotMessage = new Map<string, Message>();
client.on(Events.MessageCreate, onMessageCreate(BOT_SELF_ID, characterManager, () => webhookManager, lastBotMessage));
client.on(Events.InteractionCreate, onInteractionCreate(characterManager, () => webhookManager));
client.on(
    Events.MessageReactionAdd,
    onMessageReactionAdd(BOT_SELF_ID, characterManager, () => webhookManager, lastBotMessage),
);

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
        await client.application?.commands.set(commands);
        logger.info("Successfully registered slash commands");
    } catch (error) {
        logger.error("Failed to register slash commands:", error);
    }
}

function onInteractionCreate(characterManager: CharacterManager, getWebhookManager: () => WebhookManager) {
    return async (interaction: any) => {
        const logContext = interaction.guild
            ? `[Guild: ${interaction.guild.name} | Channel: ${
                (interaction.channel as TextChannel).name
            } | User: ${interaction.user.tag}]`
            : `[DM from ${interaction.user.tag}]`;
        try {
            if (interaction.isAutocomplete()) {
                // Handle autocomplete for character names
                if (interaction.commandName === "switch") {
                    const focusedValue = interaction.options.getFocused().toLowerCase();
                    const characters = characterManager.getCharacters();
                    const choices = characters.map((char) => ({ name: char.card.name, value: char.card.name }));

                    const filtered = choices.filter((choice) => choice.name.toLowerCase().startsWith(focusedValue))
                        .slice(
                            0,
                            25,
                        ); // Discord limits to 25 choices

                    await interaction.respond(filtered);
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

                const success = characterManager.setChannelCharacter(channelId, characterName!);

                if (success) {
                    const character = characterManager.getCharacter(characterName!);
                    await interaction.reply(`Switched to ${character!.card.name}`);
                    // Reset conversation on switch in DMs
                    if (interaction.channel?.type === ChannelType.DM) {
                        await interaction.channel.send(RESET_MESSAGE_CONTENT);
                    }
                } else {
                    const availableChars = characterManager.getCharacters().map((c) => c.card.name).join(", ");
                    await interaction.reply(
                        `Character "${characterName}" not found. Available characters: ${availableChars}`,
                    );
                }
            } else if (commandName === "list") {
                const page = interaction.options.getInteger("page") || 1;
                await handleListCommand(interaction, characterManager, page);
            } else if (commandName === "reset") {
                await interaction.reply({
                    content: RESET_MESSAGE_CONTENT,
                    ephemeral: false,
                });
            } else if (commandName === "help") {
                await interaction.reply({ content: getHelpText(), ephemeral: true });
            }
        } catch (error) {
            logger.error("Error in onInteractionCreate:", error);
            await dumpDebug(logContext, "interaction-error", error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            }
        }
    };
}

async function handleListCommand(interaction: any, characterManager: CharacterManager, page: number) {
    const logContext = interaction.guild
        ? `[Guild: ${interaction.guild.name} | Channel: ${
            (interaction.channel as TextChannel).name
        } | User: ${interaction.user.tag}]`
        : `[DM from ${interaction.user.tag}]`;
    const channelId = interaction.channel?.id;
    if (!channelId) {
        await interaction.reply({ content: "Command can only be used in channels.", ephemeral: true });
        return;
    }

    const currentChar = characterManager.getChannelCharacter(channelId);
    const allCharacters = characterManager.getCharacters();

    if (allCharacters.length === 0) {
        await interaction.reply({
            content: "There are no characters loaded.",
            ephemeral: true,
        });
        return;
    }

    const itemsPerPage = 4; // 4 characters + 1 for "None"
    const totalPages = Math.ceil(allCharacters.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;

    const characterSlice = allCharacters.slice(start, end);

    const embeds = characterSlice.map((char) => {
        dumpDebug(logContext, "list-character", char);
        let description = char.card.description || (char.card as any).data?.description;
        const embed = new EmbedBuilder()
            .setTitle(char.card.name)
            .setColor(char === currentChar ? 0x00FF00 : 0x0099FF); // Green if current, blue otherwise

        if (description && description.trim() !== "") {
            if (description.length > 256) { // Keep descriptions short for list view
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
        dumpDebug(logContext, "list-embed", embed.toJSON());
        return embed;
    });

    const allEmbeds = [...embeds];

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`list-prev`)
                .setLabel("Previous")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`list-next`)
                .setLabel("Next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages),
        );

    const replyOptions = {
        embeds: allEmbeds,
        components: [row],
        ephemeral: true,
    };

    const reply = await interaction.reply(replyOptions);
    const collector = reply.createMessageComponentCollector({ time: 60000 });

    let currentPage = page;
    collector.on("collect", async (i: any) => {
        if (i.customId === "list-next") {
            currentPage++;
        } else if (i.customId === "list-prev") {
            currentPage--;
        }

        await i.update(generateReply(currentPage));
    });

    collector.on("end", async () => {
        await interaction.editReply({ components: [] });
    });

    function generateReply(currentPage: number) {
        const totalPages = Math.ceil(allCharacters.length / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;

        const characterSlice = allCharacters.slice(start, end);

        const embeds = characterSlice.map((char) => {
            dumpDebug(logContext, "list-character", char);
            let description = char.card.description || (char.card as any).data?.description;
            const embed = new EmbedBuilder()
                .setTitle(char.card.name)
                .setColor(char === currentChar ? 0x00FF00 : 0x0099FF); // Green if current, blue otherwise

            if (description && description.trim() !== "") {
                if (description.length > 256) { // Keep descriptions short for list view
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
            dumpDebug(logContext, "list-embed", embed.toJSON());
            return embed;
        });

        const allEmbeds = [...embeds];

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`list-prev`)
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage <= 1),
                new ButtonBuilder()
                    .setCustomId(`list-next`)
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage >= totalPages),
            );

        return {
            embeds: allEmbeds,
            components: [row],
            ephemeral: true,
        };
    }
}

function onMessageReactionAdd(
    botId: string,
    characterManager: CharacterManager,
    getWebhookManager: () => WebhookManager,
    lastBotMessage: Map<string, Message>,
) {
    return async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
        // Ignore reactions from bots
        if (user.bot) return;

        // Fetch partials
        if (reaction.partial) {
            try {
                reaction = await reaction.fetch();
            } catch (error) {
                logger.error("Failed to fetch reaction:", error);
                return;
            }
        }
        if (user.partial) {
            try {
                user = await user.fetch();
            } catch (error) {
                logger.error("Failed to fetch user from reaction:", error);
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                logger.error("Failed to fetch message from reaction:", error);
                return;
            }
        }

        const message = reaction.message as Message;
        const logContext = message.guild
            ? `[Guild: ${message.guild.name} | Channel: ${(message.channel as TextChannel).name} | User: ${user.tag}]`
            : `[DM from ${user.tag}]`;

        // Ignore reactions that aren't the re-roll or delete emojis, or on messages from non-bots
        if (!["♻️", "❌"].includes(reaction.emoji.name!) || !message.author.bot) {
            return;
        }

        // Handle message deletion
        if (reaction.emoji.name === "❌") {
            try {
                await message.delete();
            } catch (error) {
                logger.warn("Failed to delete message:", error);
            }
            return;
        }

        // If this isn't the last message the bot sent, remove the reaction
        let lastMessage = lastBotMessage.get(message.channel.id);
        logger.info(`${logContext} Last bot message in cache for channel ${message.channel.id}: ${lastMessage?.id}`);

        // If the bot restarted, the map will be empty. Try to recover by fetching recent messages.
        if (!lastMessage) {
            logger.info("lastBotMessage not found in cache, fetching history...");
            const messages = await message.channel.messages.fetch({ limit: 25 });
            logger.info(`Fetched ${messages.size} messages. Inspecting for bot messages...`);
            messages.forEach((m) => {
                logger.info(
                    `Msg ID: ${m.id}, Author ID: ${m.author.id}, isBot: ${m.author.bot}, webhookId: ${m.webhookId}`,
                );
            });
            const lastBotMsgInHistory = messages.filter((m) => m.author.bot).first();
            if (lastBotMsgInHistory) {
                logger.info(`Found last bot message in history: ${lastBotMsgInHistory.id}`);
                lastMessage = lastBotMsgInHistory;
                lastBotMessage.set(message.channel.id, lastBotMsgInHistory); // Cache it for next time
            } else {
                logger.info("No bot message found in recent history.");
            }
        }

        if (!lastMessage || message.id !== lastMessage.id) {
            if (message.channel.type !== ChannelType.DM) {
                logger.info(
                    `${logContext} Attempting to remove reaction from user ${user.id} on old message ${message.id}`,
                );
                try {
                    await reaction.users.remove(user.id);
                    logger.info(`${logContext} Successfully removed reaction from user ${user.id}`);
                } catch (error) {
                    logger.error(`${logContext} Failed to remove reaction from user ${user.id}:`, error);
                }
            }
            return;
        }

        logger.info(`${logContext} Re-rolling message ID ${message.id}...`);

        // Show typing indicator while we generate a new response
        let typingInterval: number | undefined;
        try {
            const channel = message.channel;
            if (channel.isTextBased() && "sendTyping" in channel) {
                await channel.sendTyping();
                typingInterval = setInterval(() => {
                    channel.sendTyping();
                }, 9000);
            }

            logger.info(`${logContext} Fetching message history for re-roll...`);
            // Fetch the message history again, up to the message before the one being re-rolled
            const messages = Array.from(
                (await message.channel.messages.fetch({ limit: 100, before: message.id })).values(),
            );
            messages.reverse(); // Oldest to newest

            // Infer the character from the message being re-rolled
            let character = null;
            if (message.webhookId) {
                character = characterManager.getCharacter(message.author.username);
            } else if (message.embeds.length > 0 && message.embeds[0].title) {
                character = characterManager.getCharacter(message.embeds[0].title);
            }
            logger.info(`${logContext} Using character for re-roll: ${character ? character.card.name : "none"}`);

            logger.info(`${logContext} Generating new response...`);
            const result = (await inferenceQueue.push(
                generateMessage,
                client,
                messages,
                botId,
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
            ))
                .completion.text();

            if (!result) {
                await sendEphemeralError(
                    message,
                    "Oops! It seems my response was blocked again. Please try rephrasing your message or using `/reset`.",
                );
                return;
            }

            const webhookManager = getWebhookManager();
            if (message.webhookId && webhookManager && character) {
                // It's a webhook message, so we can edit it
                await webhookManager.editAsCharacter(message, character, result);
            } else {
                // It's a regular message (e.g., in DMs or a fallback), so edit the embed
                const embed = new EmbedBuilder()
                    .setTitle(character ? character.card.name : "Assistant")
                    .setThumbnail(character?.avatarUrl ?? null)
                    .setDescription(result);
                await message.edit({ embeds: [embed] });
            }
            logger.info(`${logContext} Re-roll successful for message ID ${message.id}`);

            // Remove the user's reaction that triggered the re-roll
            if (message.channel.type !== ChannelType.DM) {
                logger.info(`Attempting to remove user's re-roll reaction from message ${message.id}`);
                try {
                    await reaction.users.remove(user.id);
                    logger.info(`Successfully removed user's re-roll reaction.`);
                } catch (error) {
                    logger.error(`Failed to remove user's re-roll reaction:`, error);
                }
            }
        } catch (error) {
            logger.error(`${logContext} Failed to re-roll response for message ID ${message.id}:`, error);
        } finally {
            if (typingInterval) {
                clearInterval(typingInterval);
            }
        }
    };
}

async function sendEphemeralError(message: Message, content: string) {
    try {
        if (message.channel.isTextBased()) {
            const reply = await message.reply({
                content,
            });
            // Delete the message after 10 seconds to make it "temporary"
            setTimeout(() => {
                reply.delete().catch((e) => logger.error("Failed to delete error message:", e));
            }, 10000);
        }
    } catch (e) {
        logger.error("Failed to send ephemeral error message:", e);
    }
}

function onMessageCreate(
    botId: string,
    characterManager: CharacterManager,
    getWebhookManager: () => WebhookManager,
    lastBotMessage: Map<string, Message>,
) {
    return async (message: Message) => {
        if (message.content === RESET_MESSAGE_CONTENT || message.interaction) {
            return;
        }
        // If the message is from a regular bot (not webhook), ignore it
        // But allow webhook messages to be processed
        if (message.author.bot && !message.webhookId) {
            return;
        }
        if (message.author.id === botId && message.content.startsWith("Switched to ")) {
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

        // If no character is set (raw mode), try to infer from recent history
        if (character === null && characterManager.getCharacters().length > 0) {
            logger.info(`No character set for channel ${message.channel.id}. Inferring from history...`);
            const recentMessages = await message.channel.messages.fetch({ limit: 20 }); // Check last 20 messages
            for (const recentMessage of recentMessages.values()) {
                if (recentMessage.id === message.id) continue; // Skip the message that triggered this

                let characterName: string | null = null;
                // Is it a webhook message from a character?
                if (recentMessage.webhookId && (recentMessage as any).author?.username) {
                    characterName = (recentMessage as any).author.username;
                } // Is it an embed message from the bot representing a character?
                else if (recentMessage.author.id === botId && recentMessage.embeds.length > 0) {
                    const embed = recentMessage.embeds[0];
                    // The character name is in the title of the embed
                    if (embed.title && embed.title !== "Assistant") {
                        characterName = embed.title;
                    }
                }

                if (characterName) {
                    const inferredChar = characterManager.getCharacter(characterName);
                    if (inferredChar) {
                        logger.info(`Inferred character ${inferredChar.card.name} for channel ${message.channel.id}`);
                        characterManager.setChannelCharacter(message.channel.id, inferredChar.card.name);
                        character = inferredChar;
                        break; // Stop after finding the most recent character message
                    }
                }
            }
        }

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

        // Per user request, if the bot is directly @-mentioned in the message body,
        // it should override any character and use raw mode. Reply pings do not count.
        if (message.content.includes(`<@${botId}>`)) {
            character = null;
            logger.info(`Forcing raw mode due to direct bot mention in message content.`);
        }

        // If no character is available, apply special handling
        if (!character) {
            if (message.channel.type === ChannelType.DM) {
                // In DMs, if no character is set, show the help message
                await message.reply({ content: getHelpText(), allowedMentions: { repliedUser: true } });
                return;
            } else if (message.guild) {
                // In guilds, only allow admins to use the raw assistant
                const member = await message.guild.members.fetch(message.author.id);
                const adminOverrideId = getAdminOverrideId();
                if (!member.permissions.has("Administrator") && member.id !== adminOverrideId) {
                    await sendEphemeralError(
                        message,
                        "You must be an administrator to interact with the raw assistant.",
                    );
                    return;
                }
            }
        }

        const logContext = message.guild
            ? `[Guild: ${message.guild.name} | Channel: ${
                (message.channel as TextChannel).name
            } | User: ${message.author.tag}]`
            : `[DM from ${message.author.tag}]`;

        logger.info(`${logContext} Using character: ${character ? character.card.name : "none"}`);
        logger.info(`${logContext} Fetching message history...`);

        const messages = Array.from((await message.channel.messages.fetch({ limit: 100 })).values());
        if (!messages.includes(message)) {
            messages.push(message);
        }
        // Context is reverse on discord for some reason
        messages.reverse();

        // Send initial typing event and set up recurring typing
        let typingInterval: number | undefined;
        const channel = message.channel;
        if (channel.isTextBased() && "sendTyping" in channel) {
            await channel.sendTyping();
            typingInterval = setInterval(() => {
                channel.sendTyping();
            }, 9000); // Discord stops typing after 10 seconds.
        }

        try {
            logger.info(`${logContext} Generating response...`);
            const result = (await inferenceQueue.push(
                generateMessage,
                client,
                messages,
                botId,
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
            ))
                .completion.text();

            if (!result) {
                adze.error("Empty response from API, likely due to ToS violation.");
                await sendEphemeralError(
                    message,
                    "Oops! It seems my response was blocked, likely for safety reasons. This can happen if a message goes against our terms of service. You could try deleting your last message and rephrasing, or use the `/reset` command to clear our conversation and start fresh.",
                );
                return; // Exit early
            }

            // Escape special regex characters in the character's name
            const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // Determine the name to remove from the beginning of the reply
            const nameToRemove = character ? character.card.name : "Assistant";
            const nameRegex = new RegExp(`^${escapeRegex(nameToRemove)}:\\s*`, "i");
            const reply = result.replace(nameRegex, "");
            logger.info(`${logContext} Replying...`);

            // Use webhook if possible (only in guild channels), otherwise fall back to regular reply
            const webhookManager = getWebhookManager();
            const messageParts = smartSplit(reply);

            for (const part of messageParts) {
                // Before sending a new message, get the previous one and remove its reaction
                let previousBotMessage = lastBotMessage.get(message.channel.id);

                // If the bot restarted, try to recover the last message from history
                if (!previousBotMessage) {
                    logger.info("previousBotMessage not found in cache, fetching history...");
                    const messages = await message.channel.messages.fetch({ limit: 10 });
                    logger.info(
                        `Fetched ${messages.size} messages for previous message recovery. Inspecting for bot messages...`,
                    );
                    messages.forEach((m) => {
                        logger.info(
                            `Msg ID: ${m.id}, Author ID: ${m.author.id}, isBot: ${m.author.bot}, webhookId: ${m.webhookId}`,
                        );
                    });
                    const lastBotMsgInHistory = messages.filter((m) => m.author.bot).first();
                    if (lastBotMsgInHistory) {
                        logger.info(`Found previous bot message in history: ${lastBotMsgInHistory.id}`);
                        previousBotMessage = lastBotMsgInHistory;
                    } else {
                        logger.info("No previous bot message found in recent history.");
                    }
                }

                if (previousBotMessage && previousBotMessage.channel.type !== ChannelType.DM) {
                    logger.info(`Attempting to remove previous bot reaction from message ${previousBotMessage.id}`);
                    try {
                        const reaction = previousBotMessage.reactions.cache.get("♻️");
                        if (reaction && reaction.me) {
                            await reaction.remove();
                            logger.info(`Successfully removed previous bot reaction.`);
                        }
                    } catch (error) {
                        logger.error("Failed to remove previous bot reaction:", error);
                    }
                }

                if (
                    webhookManager &&
                    message.channel instanceof TextChannel &&
                    message.channel.type === ChannelType.GuildText
                ) {
                    if (character) {
                        const sentMessage = await webhookManager.sendAsCharacter(
                            message.channel,
                            character,
                            part,
                        );
                        if (sentMessage) {
                            lastBotMessage.set(message.channel.id, sentMessage);
                            await sentMessage.react("♻️");
                            await sentMessage.react("❌");
                        } else {
                            // Fallback to embed reply if webhook fails
                            const embed = new EmbedBuilder()
                                .setTitle(character.card.name)
                                .setThumbnail(character.avatarUrl ?? null)
                                .setDescription(part);
                            const sentMessage = await message.reply({
                                embeds: [embed],
                                allowedMentions: { repliedUser: true },
                            });
                            lastBotMessage.set(message.channel.id, sentMessage);
                            await sentMessage.react("♻️");
                            await sentMessage.react("❌");
                        }
                    } else {
                        // Raw mode, no character
                        const sentMessage = await message.reply({
                            content: part,
                            allowedMentions: { repliedUser: true },
                        });
                        lastBotMessage.set(message.channel.id, sentMessage);
                        await sentMessage.react("♻️");
                        await sentMessage.react("❌");
                    }
                } else {
                    // DMs or channels without webhook support
                    const embed = new EmbedBuilder()
                        .setTitle(character ? character.card.name : "Assistant")
                        .setThumbnail(character?.avatarUrl ?? null)
                        .setDescription(part);
                    const sentMessage = await message.reply({
                        embeds: [embed],
                        allowedMentions: { repliedUser: true },
                    });
                    lastBotMessage.set(message.channel.id, sentMessage);
                    await sentMessage.react("♻️");
                    await sentMessage.react("❌");
                }
            }
            logger.info(`${logContext} Reply sent!`);
        } catch (exception: unknown) {
            logger.error(`${logContext} Failed to generate or send response:`, exception);
            if (exception && typeof exception === "object" && "status" in exception) {
                const status = (exception as { status: number }).status;
                if (status >= 400 && status < 500) {
                    await sendEphemeralError(
                        message,
                        `The model returned a client error (HTTP ${status}). This could be an issue with the request.`,
                    );
                } else if (status >= 500) {
                    await sendEphemeralError(
                        message,
                        `The model returned a server error (HTTP ${status}). The service may be down.`,
                    );
                }
            } else {
                await sendEphemeralError(message, "An unexpected error occurred while generating a response.");
            }
        } finally {
            // Stop typing events
            clearInterval(typingInterval);
        }
    };
}

function getHelpText() {
    return `
Welcome to the bot! Here's a quick guide on how to interact:

**Commands:**
*   \`/switch <character>\`: Switch the active character for the current channel.
*   \`/list\`: Lists available characters.
*   \`/reset\`: Resets the conversation history with the bot.
*   \`/help\`: Shows this help message.

**How to Interact:**
*   **Direct Messages (DMs):** Send a message to the bot to talk to your character.
*   **In a Server:** Mention the bot (@<bot_name>) to talk to the active character.

**Message Actions:**
*   React with ♻️ on the bot's latest message to re-roll the response.
*   React with ❌ on one of the bot's messages to delete it.

**Roleplaying:**
*   Use asterisks for actions, like \`*I walk into the room*\`.
*   For out-of-character (OOC) messages, use the format: \`{OOC: your message here}\`.

Have fun!
    `.trim();
}
