import { isDebugEnabled } from "./env.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

const LOG_DIR = "./logs";

export async function dumpDebug(context: string, ...args: unknown[]) {
    if (!isDebugEnabled()) {
        return;
    }

    await ensureDir(LOG_DIR);
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const logPath = `${LOG_DIR}/${timestamp}-${context}.log`;
    const content = args.map((arg) => JSON.stringify(arg, null, 2)).join("\n");
    await Deno.writeTextFile(logPath, content);
}
