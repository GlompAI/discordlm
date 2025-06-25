import { ChannelType, Client, EmbedBuilder, hideLinkEmbed, hyperlink, Message, TextChannel } from "discord.js";
import { CharacterService } from "../services/CharacterService.ts";
import { LLMService } from "../services/LLMService.ts";
import { configService } from "../services/ConfigService.ts";
import { smartSplit } from "../utils.ts";
import adze from "npm:adze";
import { getHelpText } from "../utils.ts";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { Queue } from "../queue.ts";
import { ComponentService } from "../services/ComponentService.ts";
import { WEBHOOK_IDENTIFIER } from "../WebhookManager.ts";
import { RateLimitService } from "../services/RateLimitService.ts";
import { accessControlService } from "../services/AccessControlService.ts";

export class MessageCreateHandler {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly inferenceQueue: Queue;
    private readonly componentService: ComponentService;
    private readonly rateLimitService: RateLimitService;

    constructor(
        private readonly characterService: CharacterService,
        private readonly llmService: LLMService,
        private readonly client: Client,
    ) {
        this.inferenceQueue = new Queue(configService.getInferenceParallelism());
        this.componentService = new ComponentService();
        this.rateLimitService = new RateLimitService(configService.getRateLimitPerMinute());
    }

    public async handle(message: Message): Promise<void> {
        if (!accessControlService.isUserAllowed(message.author.id)) {
            await this.sendEphemeralError(message, "Interaction blocked.");
            return;
        }
        if (message.content === RESET_MESSAGE_CONTENT || message.interaction) {
            return;
        }
        if (message.author.bot && (!message.webhookId || !message.content.endsWith(WEBHOOK_IDENTIFIER))) {
            return;
        }
        if (message.author.id === configService.getBotSelfId() && message.content.startsWith("Switched to ")) {
            return;
        }

        const mentionsBot = message.mentions.has(configService.getBotSelfId());
        const isDM = message.channel.type === ChannelType.DM;

        let repliesToWebhookCharacter = false;
        let repliesToSwitchMessage = false;
        let targetCharacterName = "";

        let repliesToAssistant = false;
        if (message.reference && message.reference.messageId) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (
                    repliedMessage.author.id === configService.getBotSelfId() &&
                    repliedMessage.content.startsWith("Switched to ")
                ) {
                    const match = repliedMessage.content.match(/Switched to \*\*(.*?)\*\*/);
                    if (match) {
                        targetCharacterName = match[1];
                    } else {
                        targetCharacterName = repliedMessage.content.substring("Switched to ".length);
                    }
                    repliesToSwitchMessage = true;
                    this.logger.info(`Parsed character name from reply: ${targetCharacterName}`);
                } else if (repliedMessage.webhookId) {
                    targetCharacterName = (repliedMessage as Message).author?.username || "";
                    repliesToWebhookCharacter = true;
                } else if (
                    repliedMessage.author.id === configService.getBotSelfId() &&
                    !repliedMessage.webhookId &&
                    !repliedMessage.content.startsWith("Switched to ")
                ) {
                    // This is a reply to an Assistant message (regular bot message, not webhook)
                    repliesToAssistant = true;
                    targetCharacterName = configService.getAssistantName();
                    this.logger.info(`Detected reply to Assistant message`);
                }
            } catch (error) {
                this.logger.error("Failed to fetch replied message:");
                console.log(error);
            }
        }

        let mentionsCharacterByName = false;
        const characters = this.characterService.getCharacters();
        for (const char of characters) {
            const characterNameRegex = new RegExp(`@${char.card.name}\\b`, "i");
            if (characterNameRegex.test(message.content)) {
                mentionsCharacterByName = true;
                targetCharacterName = char.card.name;
                break;
            }
        }

        const shouldProcess = mentionsBot || repliesToWebhookCharacter || mentionsCharacterByName ||
            repliesToSwitchMessage || repliesToAssistant || isDM;

        if (!shouldProcess) {
            return;
        }

        let typingInterval: number | undefined;
        const channel = message.channel;
        if (channel.isTextBased() && "sendTyping" in channel) {
            await channel.sendTyping();
            typingInterval = setInterval(() => {
                channel.sendTyping();
            }, 9000);
        }

        let character = null;
        const isDirectPing = message.content.includes(`<@${configService.getBotSelfId()}>`);

        if (isDirectPing || repliesToAssistant) {
            this.logger.info(
                `Forcing assistant character due to ${
                    isDirectPing ? "direct bot mention" : "reply to Assistant message"
                }.`,
            );
            character = this.characterService.getAssistantCharacter();
        } else if (isDM) {
            if (message.channel.isTextBased()) {
                character = await this.characterService.inferCharacterFromHistory(message.channel);
            }
        } else {
            if (repliesToWebhookCharacter || mentionsCharacterByName || repliesToSwitchMessage) {
                character = this.characterService.getCharacter(targetCharacterName);
            } else {
                character = await this.characterService.inferCharacterFromHistory(message.channel);
            }
        }

        let sanitize = false;
        if (!character) {
            if (message.channel.type === ChannelType.DM) {
                await message.reply({ content: getHelpText(), allowedMentions: { repliedUser: true } });
                return;
            } else if (message.guild) {
                const member = await message.guild.members.fetch(message.author.id);
                const adminOverrideId = configService.getAdminOverrideId();
                if (!member.permissions.has("Administrator") && member.id !== adminOverrideId) {
                    sanitize = true;
                }
            }
        }

        const logContext = message.guild
            ? `[Guild: ${message.guild.name} | Channel: ${
                (message.channel as TextChannel).name
            } | User: ${message.author.tag}]`
            : `[DM from ${message.author.tag}]`;

        this.logger.info(`${logContext} Using character: ${character ? character.card.name : "none"}`);

        // Check rate limit
        if (!this.rateLimitService.canMakeRequest(message.author.id)) {
            this.logger.info(`${logContext} User is rate limited`);
            await this.rateLimitService.sendRateLimitNotification(message);

            // Queue the task for later execution
            this.rateLimitService.queueTask(message.author.id, async () => {
                const isSFW = message.channel.type !== ChannelType.DM &&
                    "nsfw" in message.channel &&
                    !message.channel.nsfw;
                await this.processMessage(message, character, sanitize, logContext, typingInterval, isSFW);
            });
            return;
        }

        const isSFW = message.channel.type !== ChannelType.DM &&
            "nsfw" in message.channel &&
            !message.channel.nsfw;
        await this.processMessage(message, character, sanitize, logContext, typingInterval, isSFW);
    }

    private async processMessage(
        message: Message,
        character: any,
        sanitize: boolean,
        logContext: string,
        typingInterval?: number,
        isSFW: boolean = false,
    ): Promise<void> {
        this.logger.info(`${logContext} Fetching message history...`);

        // Fetch messages in batches up to 1000 total
        const allMessages: Message[] = [];
        let lastMessageId: string | undefined = message.id;
        let foundReset = false;
        const maxMessages = 1000;
        const batchSize = 100; // Discord API limit per request

        // First, add the current message
        allMessages.push(message);

        while (allMessages.length < maxMessages && !foundReset) {
            const fetchOptions: { limit: number; before?: string } = {
                limit: batchSize,
                before: lastMessageId,
            };

            const batch = await message.channel.messages.fetch(fetchOptions);
            const batchArray = Array.from(batch.values());

            if (batchArray.length === 0) {
                break; // No more messages to fetch
            }

            // Discord returns messages in reverse chronological order (newest first)
            // We need to reverse each batch to get chronological order
            batchArray.reverse();

            // Check for reset message in this batch (now in chronological order)
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
                // Only include messages after the reset
                const messagesAfterReset = batchArray.slice(resetIndex + 1);
                allMessages.unshift(...messagesAfterReset);
            } else {
                // Add all messages from this batch to the beginning
                allMessages.unshift(...batchArray);
            }

            // Update lastMessageId for next batch (use the oldest message from this batch)
            lastMessageId = batchArray[0].id;

            // Stop if we've reached the desired limit
            if (allMessages.length >= maxMessages) {
                // Trim from the beginning (oldest messages) to keep the most recent ones
                allMessages.splice(0, allMessages.length - maxMessages);
                break;
            }
        }

        const messages = allMessages;
        this.logger.info(`${logContext} Fetched ${messages.length} messages in chronological order`);

        try {
            this.logger.info(`${logContext} Generating response...`);
            const result = await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService) as any,
                this.client,
                messages,
                configService.getBotSelfId(),
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
                false,
                sanitize,
                isSFW,
            ) as any;

            if (result.completion.promptFeedback?.blockReason) {
                const reason = result.completion.promptFeedback.blockReason;
                adze.error(`Response blocked due to: ${reason}`);
                let userMessage =
                    "Oops! It seems my response was blocked. This can happen for a variety of reasons, including if a message goes against our terms of service.";
                if (reason === "SAFETY") {
                    userMessage =
                        "Oops! It seems my response was blocked for safety reasons. You could try deleting your last message and rephrasing, or use the `/reset` command to clear our conversation and start fresh.";
                }
                await this.sendEphemeralError(message, userMessage);
                return;
            }

            const text = result.completion.text();
            if (!text) {
                adze.error("Empty response from API, but no block reason provided.");
                await this.sendEphemeralError(
                    message,
                    "I received an empty response from the AI. Please try again.",
                );
                return;
            }

            const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const nameToRemove = character ? character.card.name : "Assistant";
            const nameRegex = new RegExp(`^${escapeRegex(nameToRemove)}:\\s*`, "i");
            const reply = text.replace(nameRegex, "");
            this.logger.info(`${logContext} Replying...`);

            const messageParts = smartSplit(reply);

            for (const part of messageParts) {
                // Get webhook manager from character service
                const webhookManager = this.characterService.getWebhookManager();

                // Check if this is the Assistant character (should not use webhooks)
                const isAssistant = character && character.card.name === configService.getAssistantName();

                // If we have a non-Assistant character and webhook manager, and we're in a guild channel
                if (
                    character && !isAssistant && webhookManager && message.guild &&
                    message.channel instanceof TextChannel
                ) {
                    // Send as character using webhook
                    const sentMessage = await webhookManager.sendAsCharacter(
                        message.channel,
                        character,
                        part,
                        { components: [this.componentService.createActionRow()] },
                        message,
                        message.author,
                    );
                    if (!sentMessage) {
                        // Fallback to regular reply if webhook fails
                        const url = `https://discord.com/users/${message.author.id}`;
                        const link = hyperlink(`Generated by ${message.author.displayName}`, hideLinkEmbed(url));
                        await message.reply({
                            content: `${part}\n${link}`,
                            allowedMentions: { repliedUser: true },
                            components: [this.componentService.createActionRow()],
                        });
                    }
                } else {
                    // For DMs, Assistant, or when no character is selected, use regular reply
                    if (message.channel.type === ChannelType.DM) {
                        // In DMs, use embeds
                        const embed = new EmbedBuilder()
                            .setTitle(character ? character.card.name : "Assistant")
                            .setThumbnail(character?.avatarUrl ?? null)
                            .setDescription(part);

                        await message.reply({
                            embeds: [embed],
                            allowedMentions: { repliedUser: true },
                            components: [this.componentService.createActionRow()],
                        });
                    } else {
                        // In guilds for Assistant or no character, send plain text
                        const url = `https://discord.com/users/${message.author.id}`;
                        const link = hyperlink(`Generated by ${message.author.displayName}`, hideLinkEmbed(url));
                        await message.reply({
                            content: `${part}\n${link}`,
                            allowedMentions: { repliedUser: true },
                            components: [this.componentService.createActionRow()],
                        });
                    }
                }
            }
            this.logger.info(`${logContext} Reply sent!`);
        } catch (exception: unknown) {
            this.logger.error(`${logContext} Failed to generate or send response:`, exception);
            if (exception && typeof exception === "object" && "status" in exception) {
                const status = (exception as { status: number }).status;
                if (status >= 400 && status < 500) {
                    await this.sendEphemeralError(
                        message,
                        `The model returned a client error (HTTP ${status}). This could be an issue with the request.`,
                    );
                } else if (status >= 500) {
                    await this.sendEphemeralError(
                        message,
                        `The model returned a server error (HTTP ${status}). The service may be down.`,
                    );
                }
            } else {
                await this.sendEphemeralError(message, "An unexpected error occurred while generating a response.");
            }
        } finally {
            clearInterval(typingInterval);
        }
    }

    private async sendEphemeralError(message: Message, content: string) {
        try {
            if (message.channel.isTextBased()) {
                const reply = await message.reply({
                    content,
                });
                setTimeout(() => {
                    reply.delete().catch((e) => this.logger.error("Failed to delete error message:", e));
                }, 10000);
            }
        } catch (e) {
            this.logger.error("Failed to send ephemeral error message:", e);
        }
    }
}
