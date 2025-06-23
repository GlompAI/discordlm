import { isDebugEnabled } from "./env.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

const LOG_DIR = "./logs";

export async function dumpDebug(
    logContext: string,
    context: string,
    ...args: unknown[]
) {
    if (!isDebugEnabled()) {
        return;
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-");
    let logPath = "";

    if (logContext.startsWith("[DM from")) {
        const userMatch = logContext.match(/\[DM from (.*)\]/);
        const user = userMatch ? userMatch[1].replace(/[^a-zA-Z0-9]/g, "_") : "unknown_user";
        const dir = `${LOG_DIR}/dm/${user}`;
        await ensureDir(dir);
        logPath = `${dir}/${timestamp}-${context}.log`;
    } else {
        const guildMatch = logContext.match(/\[Guild: (.*?) \|/);
        const channelMatch = logContext.match(/\| Channel: (.*?) \|/);
        const userMatch = logContext.match(/\| User: (.*)\]/);

        const guild = guildMatch ? guildMatch[1].replace(/[^a-zA-Z0-9]/g, "_") : "unknown_guild";
        const channel = channelMatch ? channelMatch[1] : "unknown_channel";
        const user = userMatch ? userMatch[1].replace(/[^a-zA-Z0-9]/g, "_") : "unknown_user";

        const dir = `${LOG_DIR}/${guild}`;
        await ensureDir(dir);
        logPath = `${dir}/${timestamp}-${channel}-${user}-${context}.log`;
    }

    const content = args.map((arg) => JSON.stringify(arg, null, 2)).join("\n");
    await Deno.writeTextFile(logPath, content);
}
