export interface MessageView {
    message: string;
    user: string;
    role: "user" | "assistant" | "system" | "function";
    tokens?: number;
    messageId: string;
    timestamp: string;
    mediaContent?: unknown[];
    name?: string;
}
