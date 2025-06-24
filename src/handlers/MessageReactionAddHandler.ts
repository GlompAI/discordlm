import {
    ChannelType,
    Client,
    EmbedBuilder,
    Message,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    TextChannel,
    User,
} from "npm:discord.js";
import { CharacterService } from "../services/CharacterService.ts";
import { LLMService } from "../services/LLMService.ts";
import { ConversationService } from "../services/ConversationService.ts";
import { configService } from "../services/ConfigService.ts";
import adze from "npm:adze";
import { Queue } from "../queue.ts";

export class MessageReactionAddHandler {
    private readonly logger = adze.withEmoji.timestamp.seal();
    private readonly inferenceQueue: Queue;

    constructor(
        private readonly characterService: CharacterService,
        private readonly llmService: LLMService,
        private readonly conversationService: ConversationService,
        private readonly client: Client,
    ) {
        this.inferenceQueue = new Queue(configService.getInferenceParallelism());
    }

    public async handle(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
        if (user.bot) return;

        if (reaction.partial) {
            try {
                reaction = await reaction.fetch();
            } catch (error) {
                this.logger.error("Failed to fetch reaction:", error);
                return;
            }
        }
        if (user.partial) {
            try {
                user = await user.fetch();
            } catch (error) {
                this.logger.error("Failed to fetch user from reaction:", error);
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                this.logger.error("Failed to fetch message from reaction:", error);
                return;
            }
        }

        const message = reaction.message as Message;
        const logContext = message.guild
            ? `[Guild: ${message.guild.name} | Channel: ${(message.channel as TextChannel).name} | User: ${user.tag}]`
            : `[DM from ${user.tag}]`;

        if (!["♻️", "❌", "➡️"].includes(reaction.emoji.name!) || !message.author.bot) {
            return;
        }

        if (reaction.emoji.name === "❌") {
            try {
                await message.delete();
            } catch (error) {
                this.logger.warn("Failed to delete message:", error);
            }
            return;
        }

        if (reaction.emoji.name === "➡️") {
            return this.handleContinueReaction(reaction, user, message, logContext);
        }

        let lastMessage = this.conversationService.getLastBotMessage(message.channel.id);
        this.logger.info(
            `${logContext} Last bot message in cache for channel ${message.channel.id}: ${lastMessage?.id}`,
        );

        if (!lastMessage) {
            this.logger.info("lastBotMessage not found in cache, fetching history...");
            const messages = await message.channel.messages.fetch({ limit: 25 });
            const lastBotMsgInHistory = messages.filter((m) => m.author.bot).first();
            if (lastBotMsgInHistory) {
                this.logger.info(`Found last bot message in history: ${lastBotMsgInHistory.id}`);
                lastMessage = lastBotMsgInHistory;
                this.conversationService.setLastBotMessage(message.channel.id, lastBotMsgInHistory);
            } else {
                this.logger.info("No bot message found in recent history.");
            }
        }

        if (!lastMessage || message.id !== lastMessage.id) {
            if (message.channel.type !== ChannelType.DM) {
                this.logger.info(
                    `${logContext} Attempting to remove reaction from user ${user.id} on old message ${message.id}`,
                );
                try {
                    await reaction.users.remove(user.id);
                    this.logger.info(`${logContext} Successfully removed reaction from user ${user.id}`);
                } catch (error) {
                    this.logger.error(`${logContext} Failed to remove reaction from user ${user.id}:`, error);
                }
            }
            return;
        }

        this.logger.info(`${logContext} Re-rolling message ID ${message.id}...`);

        let typingInterval: number | undefined;
        try {
            const channel = message.channel;
            if (channel.isTextBased() && "sendTyping" in channel) {
                await channel.sendTyping();
                typingInterval = setInterval(() => {
                    channel.sendTyping();
                }, 9000);
            }

            this.logger.info(`${logContext} Fetching message history for re-roll...`);
            const messages = Array.from(
                (await message.channel.messages.fetch({ limit: 100, before: message.id })).values(),
            );
            messages.reverse();

            let character = null;
            if (message.webhookId) {
                character = this.characterService.getCharacter(message.author.username);
            } else if (message.embeds.length > 0 && message.embeds[0].title) {
                character = this.characterService.getCharacter(message.embeds[0].title);
            }
            this.logger.info(`${logContext} Using character for re-roll: ${character ? character.card.name : "none"}`);

            this.logger.info(`${logContext} Generating new response...`);
            const result = (await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService),
                this.client,
                messages,
                configService.getBotSelfId(),
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
            ))
                .completion.text();

            if (!result) {
                await this.sendEphemeralError(
                    message,
                    "Oops! It seems my response was blocked again. Please try rephrasing your message or using `/reset`.",
                );
                return;
            }

            const webhookManager = this.characterService.getWebhookManager();
            if (message.webhookId && webhookManager && character) {
                await webhookManager.editAsCharacter(message, character, result);
            } else {
                const embed = new EmbedBuilder()
                    .setTitle(character ? character.card.name : "Assistant")
                    .setThumbnail(character?.avatarUrl ?? null)
                    .setDescription(result);
                await message.edit({ embeds: [embed] });
            }
            this.logger.info(`${logContext} Re-roll successful for message ID ${message.id}`);

            if (message.channel.type !== ChannelType.DM) {
                this.logger.info(`Attempting to remove user's re-roll reaction from message ${message.id}`);
                try {
                    await reaction.users.remove(user.id);
                    this.logger.info(`Successfully removed user's re-roll reaction.`);
                } catch (error) {
                    this.logger.error(`Failed to remove user's re-roll reaction:`, error);
                }
            }
        } catch (error) {
            this.logger.error(`${logContext} Failed to re-roll response for message ID ${message.id}:`, error);
        } finally {
            if (typingInterval) {
                clearInterval(typingInterval);
            }
        }
    }

    private async handleContinueReaction(
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
        message: Message,
        logContext: string,
    ) {
        this.logger.info(`${logContext} Continue reaction on message ID ${message.id}...`);

        let typingInterval: number | undefined;
        try {
            const channel = message.channel;
            if (channel.isTextBased() && "sendTyping" in channel) {
                await channel.sendTyping();
                typingInterval = setInterval(() => {
                    channel.sendTyping();
                }, 9000);
            }

            const messages = Array.from(
                (await message.channel.messages.fetch({ limit: 100, before: message.id })).values(),
            );
            messages.push(message);
            messages.reverse();

            let character = null;
            if (message.webhookId) {
                character = this.characterService.getCharacter(message.author.username);
            } else if (message.embeds.length > 0 && message.embeds[0].title) {
                character = this.characterService.getCharacter(message.embeds[0].title);
            }

            const result = (await this.inferenceQueue.push(
                this.llmService.generateMessage.bind(this.llmService),
                this.client,
                messages,
                configService.getBotSelfId(),
                character ? character.card : null,
                Math.floor(Math.random() * 1000000),
                true, // continuation
            ))
                .completion.text();

            if (!result) {
                await this.sendEphemeralError(
                    message,
                    "Oops! It seems my response was blocked. Please try again.",
                );
                return;
            }

            const webhookManager = this.characterService.getWebhookManager();
            if (webhookManager && character && message.channel instanceof TextChannel) {
                const sentMessage = await webhookManager.sendAsCharacter(message.channel, character, result);
                if (sentMessage) {
                    this.conversationService.setLastBotMessage(message.channel.id, sentMessage);
                    await sentMessage.react("♻️");
                    await sentMessage.react("❌");
                    await sentMessage.react("➡️");
                }
            } else if (message.channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle(character ? character.card.name : "Assistant")
                    .setThumbnail(character?.avatarUrl ?? null)
                    .setDescription(result);
                if ("send" in message.channel) {
                    const sentMessage = await message.channel.send({ embeds: [embed] });
                    this.conversationService.setLastBotMessage(message.channel.id, sentMessage);
                    await sentMessage.react("♻️");
                    await sentMessage.react("❌");
                    await sentMessage.react("➡️");
                }
            }
            this.logger.info(`${logContext} Continuation successful for message ID ${message.id}`);
        } catch (error) {
            this.logger.error(`${logContext} Failed to continue response for message ID ${message.id}:`, error);
        } finally {
            if (typingInterval) {
                clearInterval(typingInterval);
            }
            if (message.channel.type !== ChannelType.DM) {
                try {
                    await reaction.users.remove(user.id);
                    const botReactions = message.reactions.cache.filter((r) => r.me);
                    for (const botReaction of botReactions.values()) {
                        if (["❌", "➡️", "♻️"].includes(botReaction.emoji.name!)) {
                            await botReaction.remove();
                        }
                    }
                } catch (error) {
                    this.logger.error(`${logContext} Failed to remove reaction from user ${user.id}:`, error);
                }
            }
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
