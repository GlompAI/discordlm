import {
    ChannelType,
    Client,
    Events,
    GatewayIntentBits,
    Message,
    OmitPartialGroupDMChannel,
    Partials,
} from "npm:discord.js";

import { Queue } from "./queue.ts";

export const selfId = "1346480896609353769";

import adze, { setup } from "npm:adze";
import { generateMessage } from "./llm.ts";
import { getBotToken } from "./env.ts";
setup();
const logger = adze.withEmoji.timestamp.seal();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
    logger.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
client.on(Events.MessageCreate, onMessageCreate(selfId));

const BOT_TOKEN = getBotToken();

const shutdown = async () => {
    try {
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
await client.login(BOT_TOKEN);

export function trimToEndSentence(input: string) {
    if (!input) {
        return "";
    }

    const punctuation = new Set([
        ".",
        "!",
        "?",
        "*",
        '"',
        ")",
        "}",
        "`",
        "]",
        "$",
        "。",
        "！",
        "？",
        "”",
        "）",
        "】",
        "’",
        "」",
        "_",
    ]); // extend this as you see fit
    let last = -1;

    const characters = Array.from(input);
    for (let i = characters.length - 1; i >= 0; i--) {
        const char = characters[i];

        if (punctuation.has(char)) {
            if (i > 0 && /[\s\n]/.test(characters[i - 1])) {
                last = i - 1;
            } else {
                last = i;
            }
            break;
        }
    }

    if (last === -1) {
        return input.trimEnd();
    }

    return characters.slice(0, last + 1).join("").trimEnd();
}

function onMessageCreate(botId: string) {
    return async (message: OmitPartialGroupDMChannel<Message>) => {
        // If the message is from a bot simply ignore
        if (message.author.bot) return;
        // If the bot wasn't pinged in some way or directly messaged, ignore the message
        if (!(message.mentions.has(botId) || message.channel.type === ChannelType.DM)) return;

        logger.info("Fetching message history...");
        const messages = Array.from((await message.channel.messages.fetch({ limit: 100 })).values());
        if (!messages.includes(message)) {
            messages.push(message);
        }
        // Context is reverse on discord for some reason
        messages.reverse();

        let keepTyping = true;
        logger.info("Replying to message...");
        // Send typing event to users
        message.channel.sendTyping();
        // Hold a queue for the next typing message
        const queue = new Queue();
        // Chain typing event follow-ups forever until the queue is stopped through continuations
        function reSendTyping(): Promise<void> {
            message.channel.sendTyping();
            if (!keepTyping) return Promise.resolve();
            return queue.push(reSendTyping, 5000);
        }
        // Queue up the first typing event re-trigger
        queue.start();
        const task = queue.push(() => keepTyping && reSendTyping, 5000);
        let reply = "";
        try {
            logger.info("Generating response...");
            const result = (await generateMessage(client, messages, botId)).completion.choices[0].message.content;
            if (!result) {
                adze.error("Empty response from API");
                return Promise.resolve();
            }
            reply = result;
        } catch (exception) {
            logger.error("Failed to generate response: " + exception);
            console.log(exception);
            queue.stop();
            keepTyping = false;
            return task;
        }
        queue.stop();
        try {
            logger.info("Replying...");
            await message.reply(trimToEndSentence(reply));
            logger.info("Reply sent!");
        } catch (exception) {
            logger.error("Failed to reply to message: " + exception);
        }
        return task;
    };
}
