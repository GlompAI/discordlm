import {
    ActionRowBuilder,
    ButtonBuilder,
    ChannelType,
    DMChannel,
    EmbedBuilder,
    Message,
    TextChannel,
    User,
} from "discord.js";
import { CharacterConfig } from "../CharacterCard.ts";
import { componentService } from "./ComponentService.ts";
import { configService } from "./ConfigService.ts";
import { ConversationService } from "./ConversationService.ts";
import { WebhookManager } from "./WebhookManager.ts";

export interface ReplyContext {
    channel: TextChannel | DMChannel;
    character: CharacterConfig | null;
    content: string;
    messageToReply?: Message;
    interactingUser?: User;
}

export class ReplyService {
    private readonly conversationService: ConversationService;
    private readonly webhookManager: WebhookManager;

    constructor(conversationService: ConversationService, webhookManager: WebhookManager) {
        this.conversationService = conversationService;
        this.webhookManager = webhookManager;
    }

    public async reply(context: ReplyContext) {
        if (context.channel.type === ChannelType.DM) {
            await this.sendDm(context);
        } else {
            await this.sendGuild(context);
        }
    }

    private async sendDm(context: ReplyContext) {
        const { character, content, messageToReply } = context;
        const embed = new EmbedBuilder()
            .setTitle(character ? character.card.name : "Assistant")
            .setThumbnail(character?.avatarUrl ?? null)
            .setDescription(content);

        const sentMessage = await messageToReply?.reply({
            embeds: [embed],
            components: [componentService.createActionRow()],
        });
        if (sentMessage) {
            this.conversationService.setLastBotMessage(context.channel.id, sentMessage);
        }
    }

    private async sendGuild(context: ReplyContext) {
        const { character, content, messageToReply, interactingUser } = context;
        if (character && character.card.name !== configService.getAssistantName()) {
            const sentMessage = await this.webhookManager.sendAsCharacter(
                context.channel as TextChannel,
                character,
                content,
                { components: [componentService.createActionRow()] },
                messageToReply,
                interactingUser,
            );
            if (sentMessage) {
                this.conversationService.setLastBotMessage(context.channel.id, sentMessage);
            }
        } else {
            const sentMessage = await messageToReply?.reply({
                content,
                allowedMentions: { repliedUser: true },
                components: [componentService.createActionRow()],
            });
            if (sentMessage) {
                this.conversationService.setLastBotMessage(context.channel.id, sentMessage);
            }
        }
    }
}
