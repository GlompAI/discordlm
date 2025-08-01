import { ChannelType, Client, EmbedBuilder, hideLinkEmbed, hyperlink, Message, TextChannel } from "discord.js";
import { PremiumService } from "../services/PremiumService.ts";
import { CharacterConfig } from "../CharacterCard.ts";
import { CharacterService } from "../services/CharacterService.ts";
import { LLMService } from "../services/LLMService.ts";
import { configService } from "../services/ConfigService.ts";
import { getHelpText, smartSplit } from "../utils.ts";
import adze from "adze";
import { RESET_MESSAGE_CONTENT } from "../main.ts";
import { Queue } from "../queue.ts";
import { ComponentService } from "../services/ComponentService.ts";
import { WEBHOOK_IDENTIFIER, WebhookManager } from "../WebhookManager.ts";
import { RateLimitService } from "../services/RateLimitService.ts";
import { MetricsService } from "../services/MetricsService.ts";

export class MessageCreateHandler {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly inferenceQueue: Queue;
    private readonly componentService: ComponentService;
    private readonly rateLimitService: RateLimitService;
    private isShuttingDown = false;

    constructor(
        private readonly characterService: CharacterService,
        private readonly llmService: LLMService,
        private readonly client: Client,
        private readonly webhookManager: WebhookManager,
    ) {
        this.inferenceQueue = new Queue(configService.getInferenceParallelism());
        this.componentService = new ComponentService();
        this.rateLimitService = new RateLimitService(
            client,
            configService.getRateLimitPerMinute(),
            configService.getLimitUserIds(),
        );
    }

    private async delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    public async handle(message: Message): Promise<void> {
        if (this.isShuttingDown) return;

        // Ignore messages from self
        if (message.author.id === configService.botSelfId) {
            return;
        }

        // Check premium grant
        if (message.channel.type === ChannelType.DM) {
            const premiumService = PremiumService.getInstance();
            const member = await premiumService.guild?.members.fetch({
                user: message.author.id,
                force: true,
            });
            if (!member || !premiumService.isPremium(member)) {
                const messages = await message.channel.messages.fetch({ limit: 100 });
                const botMessages = messages.filter((m) =>
                    m.author.id === this.client.user?.id && !m.content.startsWith("Switched to ")
                );
                if (botMessages.size >= 10) {
                    await this.sendEphemeralError(
                        message,
                        "My funds are low, please subscribe on my server for future access.",
                    );
                    this.logger.info(`Demo limit reached for user: ${member?.displayName ?? member?.user.username}`);
                    return;
                }
            }
        }

        // Check if it's a new DM conversation and send help text
        if (message.channel.type === ChannelType.DM) {
            const messages = await message.channel.messages.fetch({ limit: 2 });
            if (messages.size <= 1) {
                await message.reply({ content: getHelpText(), allowedMentions: { repliedUser: false } });
                return;
            }
        }

        // PluralKit integration
        let oldMessage: Message | undefined = undefined;
        if (message.webhookId) {
            adze.info("Processing incoming potential PluralKit message...");
            // Ignore if no pending generations contain this new message's text
            const pendingCandidateFromHost = this.llmService.inferenceQueueList.find((m) =>
                m.content.includes(message.content)
            );
            if (!pendingCandidateFromHost) {
                adze.info("No proxy candidate message found.");
                return;
            }
            // Wait 2 seconds for PK to potentially delete
            await this.delay(2000);
            // Check if a message was proxied by confirming the original proxy candidate message was deleted
            const backlog = await message.channel.messages.fetch({ limit: 10 });
            if (backlog.values().some((m) => m.id == pendingCandidateFromHost.id)) {
                // We still see the message so it was not proxied
                adze.info("Proxy candidate message found but was not deleted.");
                return;
            }
            // Cancel the original generation before continuing with this one
            const originalIndex = this.llmService.inferenceQueueList.indexOf(pendingCandidateFromHost);
            // Rare race condition is possible, so confirm it's active just in case...
            if (originalIndex != -1) {
                adze.info("Proxy candidate message found! Queuing a new generation...");
                this.llmService.inferenceQueueList.splice(originalIndex, 1);
                oldMessage = pendingCandidateFromHost;
            }
        }

        if (
            message.content === RESET_MESSAGE_CONTENT || message.interaction ||
            message.content === "My funds are low, please subscribe on my server for future access"
        ) {
            return;
        } else if (
            !oldMessage && message.author.bot && (!message.webhookId || !message.content.endsWith(WEBHOOK_IDENTIFIER))
        ) {
            return;
        }
        if (message.author.id === configService.botSelfId && message.content.startsWith("Switched to ")) {
            return;
        }

        const mentionsBot = message.mentions.has(configService.botSelfId!);
        const isDM = message.channel.type === ChannelType.DM;

        let repliesToWebhookCharacter = false;
        let repliesToSwitchMessage = false;
        let targetCharacterName = "";

        let repliesToAssistant = false;
        let repliedMessage: Message | undefined = undefined;
        const replyEmbed = message.embeds.find((embed) => embed);
        if (message.reference && message.reference.messageId) {
            repliedMessage = await message.channel.messages.cache.get(message.reference.messageId);
        } else if (replyEmbed?.description) {
            this.logger.info("Searching an embed for a PluralKit replied message by ID....");
            const pluralKitReplyMatch = replyEmbed.description.match(/\[Reply to:]\((.*)\)\*\*/);
            if (pluralKitReplyMatch) {
                this.logger.info("Found a PluralKit replied message by ID.");
                const match = pluralKitReplyMatch[1].match(
                    /https:\/\/discord\.com\/channels\/\d+\/\d+\/(\d+)/g,
                );
                if (match) {
                    try {
                        this.logger.info("Fetching a PluralKit replied message by ID.");
                        repliedMessage = message.channel.messages.cache.get(match[1]);
                        this.logger.info("Fetched PluralKit replied message by ID.");
                    } catch (e) {
                        this.logger.error("Failed to fetch PluralKit replied message by ID!");
                        console.error(e);
                    }
                } else {
                    this.logger.warn("Did not find a PluralKit replied message by ID!");
                    console.log(pluralKitReplyMatch);
                }
            }
        }
        if (repliedMessage) {
            try {
                if (
                    repliedMessage.author.id === configService.botSelfId &&
                    repliedMessage.content.startsWith("Switched to ")
                ) {
                    const match = repliedMessage.content.match(/Switched to (.*?)\n?.*/);
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
                    if (repliedMessage.guild) {
                        const authorIdMatch = repliedMessage.content.match(
                            /\[Generated by .*?\]\(<https:\/\/discord\.com\/users\/(\d+)>\)/,
                        );
                        const authorId = authorIdMatch ? authorIdMatch[1] : null;
                        if (!authorId) {
                            // Skip webhooks that aren't ours
                            this.logger.info(
                                `Skipping reply to webhook that is not ours... Parsed authorID ${authorId}`,
                            );
                            console.log(authorIdMatch);
                            return;
                        }
                    }
                } else if (
                    repliedMessage.author.id === configService.botSelfId &&
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
        const isDirectPing = message.content.includes(`<@${configService.botSelfId}>`);

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
                const member = await message.guild.members.fetch(oldMessage?.author.id ?? message.author.id);
                const adminOverrideList = configService.getAdminOverrideList();
                if (!member.permissions.has("Administrator") && !adminOverrideList.includes(member.id)) {
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
        if (!(await this.rateLimitService.canMakeRequest(message.author))) {
            this.logger.info(`${logContext} User is rate limited`);
            await this.rateLimitService.sendRateLimitNotification(message);

            // Queue the task for later execution
            this.rateLimitService.queueTask(message.author.id, async () => {
                const isSFW = message.channel.type !== ChannelType.DM &&
                    "nsfw" in message.channel &&
                    !message.channel.nsfw;
                await this.processMessage(message, character, sanitize, logContext, typingInterval, isSFW, oldMessage);
            });
            return;
        }

        const isSFW = message.channel.type !== ChannelType.DM &&
            "nsfw" in message.channel &&
            !message.channel.nsfw;
        await this.processMessage(message, character, sanitize, logContext, typingInterval, isSFW, oldMessage);
    }

    private async processMessage(
        message: Message,
        character: CharacterConfig | null,
        sanitize: boolean,
        logContext: string,
        typingInterval?: number,
        isSFW: boolean = false,
        oldMessage?: Message,
    ): Promise<void> {
        this.llmService.inferenceQueueList.push(message);
        this.logger.info(`${logContext} Fetching message history...`);

        // Fetch messages in batches up to 1000 total
        const allMessages: Message[] = [];
        let lastMessageId: string | undefined = message.id;
        let foundReset = false;
        const maxMessages = configService.getMaxHistoryMessages();
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

        const messages = allMessages.filter((msg) => {
            const isBot = msg.author.id === this.client.user?.id;
            const isHelpMessage = msg.content.startsWith("Welcome to the bot! Here's a quick guide");
            return !(isBot && isHelpMessage);
        });
        this.logger.info(`${logContext} Fetched and filtered ${messages.length} messages in chronological order`);

        try {
            this.logger.info(`${logContext} Generating response...`);
            const llmRequestTimestamp = Date.now();
            const startTime = performance.now();
            const result = await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService) as any,
                this.client,
                messages,
                configService.botSelfId!,
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
                false,
                sanitize,
                isSFW,
            ) as any;
            const endTime = performance.now();
            const llmResponseTime = endTime - startTime;

            // Check if this was removed (and this, the generation was canceled)
            if (!this.llmService.inferenceQueueList.find((q) => q.id == message.id)) {
                adze.info(`PluralKit proxy was detected on message with former ID ${message.id}, skipping...`);
                return;
            }

            const text = result.text();
            if (!text || text.length == 0) {
                adze.error("Empty response from API, but no block reason provided.");
                await this.sendEphemeralError(
                    message,
                    "Oops! It seems my response was blocked. This can happen for a variety of reasons, including if a message goes against our terms of service. You could **try deleting your last message** and rephrasing, **re-rolling** the last character message, or **use the `/reset` command** to clear our conversation and start fresh.",
                );
                return;
            }

            const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const nameToRemove = character ? character.card.name : "Assistant";
            const nameRegex = new RegExp(`^${escapeRegex(nameToRemove)}:\\s*`, "i");
            let reply = text.replace(nameRegex, "");
            reply = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

            const messageParts = smartSplit(reply);
            if (messageParts.length == 0 || messageParts[0].trim().length == 0) {
                adze.error("Empty response from API after reasoning, but no block reason provided.");
                await this.sendEphemeralError(
                    message,
                    "Oops! It seems my response was blocked. This can happen for a variety of reasons, including if a message goes against our terms of service. You could **try deleting your last message** and rephrasing, **re-rolling** the last character message, or **use the `/reset` command** to clear our conversation and start fresh.",
                );
                return;
            }

            this.logger.info(`${logContext} Replying...`);

            for (const part of messageParts) {
                if (part.length == 0) continue;
                const webhookManager = this.webhookManager;

                // Check if this is the Assistant character (should not use webhooks)
                const isAssistant = character && character.card.name === configService.getAssistantName();

                // If we have a non-Assistant character and webhook manager, and we're in a guild channel
                if (
                    character && !isAssistant && webhookManager && message.guild &&
                    message.channel instanceof TextChannel
                ) {
                    // Send as character using webhook
                    await webhookManager.sendAsCharacter(
                        message.channel,
                        character,
                        part,
                        { components: [this.componentService.createActionRow()] },
                        message,
                        message.author,
                    );
                } else {
                    // Fallback to regular reply
                    if (isAssistant) {
                        // Assistant in a guild should send a plain text reply
                        if (message.guild) {
                            const url = `https://discord.com/users/${oldMessage?.author.id ?? message.author.id}`;
                            let name = message.author.displayName;
                            // If this was PluralKit, use webhook vanity string and skip user lookup
                            if (!message.webhookId) {
                                // Not a PluralKit user, get their guild context for name string
                                const guildMember = await message.guild.members.fetch(message.author.id);
                                if (guildMember.nickname) {
                                    name = guildMember.nickname;
                                }
                            }
                            const link = hyperlink(
                                `Generated by ${name}`,
                                hideLinkEmbed(url),
                            );
                            await message.reply({
                                content: `${part}\n${link}`,
                                allowedMentions: { repliedUser: true },
                                components: [this.componentService.createActionRow()],
                            });
                        } else {
                            await message.reply({
                                content: `${part}`,
                                allowedMentions: { repliedUser: true },
                                components: [this.componentService.createActionRow()],
                            });
                        }
                    } else if (character) {
                        // Other characters in DMs or webhook failures use embeds
                        const embed = new EmbedBuilder()
                            .setAuthor({ name: character.card.name })
                            .setThumbnail(character.avatarUrl ?? null)
                            .setDescription(part);
                        await message.reply({
                            embeds: [embed],
                            allowedMentions: { repliedUser: true },
                            components: [this.componentService.createActionRow()],
                        });
                    } else {
                        // Fallback for no character (should be rare)
                        const url = `https://discord.com/users/${oldMessage?.author.id ?? message.author.id}`;
                        let name = message.author.displayName;
                        // If this was PluralKit, use webhook vanity string and skip user lookup
                        if (!message.webhookId) {
                            // Not a PluralKit user, get their guild context for name string
                            const guildMember = await message.guild?.members.fetch(message.author.id);
                            if (guildMember?.nickname) {
                                name = guildMember.nickname;
                            }
                        }
                        const link = hyperlink(`Generated by ${name}`, hideLinkEmbed(url));
                        await message.reply({
                            content: `${part}\n${link}`,
                            allowedMentions: { repliedUser: true },
                            components: [this.componentService.createActionRow()],
                        });
                    }
                }
            }
            this.logger.info(`${logContext} Reply sent!`);

            MetricsService.record({
                username: message.author.username,
                userId: message.author.id,
                character: character?.card.name ?? "Assistant",
                channelName: message.channel.type === ChannelType.DM ? "DM" : (message.channel as TextChannel).name,
                channelId: message.channel.id,
                guildName: message.guild?.name,
                guildId: message.guild?.id,
                isNsfw: !isSFW,
                llmRequestTimestamp,
                llmResponseTime,
            });
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
            // Remove generation from the task list if still present
            const index = this.llmService.inferenceQueueList.indexOf(message);
            if (index == -1) {
                return;
            }
            this.llmService.inferenceQueueList.splice(index, 1);
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
