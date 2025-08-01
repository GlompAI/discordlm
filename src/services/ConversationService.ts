import { Message } from "discord.js";

export class ConversationService {
    private lastBotMessage = new Map<string, Message>();

    public setLastBotMessage(channelId: string, message: Message): void {
        this.lastBotMessage.set(channelId, message);
    }

    public getLastBotMessage(channelId: string): Message | undefined {
        return this.lastBotMessage.get(channelId);
    }

    public resetConversation(channelId: string): void {
        this.lastBotMessage.delete(channelId);
    }
}
