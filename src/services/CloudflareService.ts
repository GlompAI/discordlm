import adze from "adze";
import { configService } from "./ConfigService.ts";

const logger = adze.withEmoji.timestamp.seal();

export class CloudflareService {
    private process: Deno.ChildProcess | null = null;

    public start(): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            const tunnelId = configService.getCloudflareTunnelId();
            const credentialsFile = configService.getCloudflareCredentialsFile();
            const hostname = configService.getCloudflareHostname();

            if (tunnelId && credentialsFile && hostname) {
                logger.info(`Starting permanent Cloudflare tunnel for ${hostname}`);
                this.process = new Deno.Command("cloudflared", {
                    args: [
                        "tunnel",
                        "--no-autoupdate",
                        "run",
                        "--credentials-file",
                        credentialsFile,
                        "--url",
                        "http://127.0.0.1:18888",
                        tunnelId,
                    ],
                }).spawn();
                resolve(hostname);
            } else {
                logger.info("Starting temporary Cloudflare tunnel");
                const command = new Deno.Command("cloudflared", {
                    args: ["tunnel", "--url", "http://127.0.0.1:18888"],
                    stderr: "piped",
                });
                this.process = command.spawn();

                const reader = this.process.stderr.getReader();
                const decoder = new TextDecoder();
                let output = "";

                const readStream = async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            output += decoder.decode(value);
                            const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                            if (match) {
                                const url = new URL(match[0]);
                                logger.info(`Cloudflare tunnel established at ${url.hostname}`);
                                resolve(url.hostname);
                                reader.releaseLock();
                                return;
                            }
                        }
                    } catch (err) {
                        reject(err);
                    }
                };

                readStream();
            }

            if (this.process) {
                this.process.status.then((status) => {
                    if (!status.success) {
                        const errorMsg = `Cloudflared process exited with code: ${status.code}`;
                        logger.error(errorMsg);
                        reject(new Error(errorMsg));
                    }
                });
            } else {
                reject(new Error("Failed to start Cloudflared process."));
            }
        });
    }

    public async stop(): Promise<void> {
        if (this.process) {
            logger.info("Stopping Cloudflare tunnel...");
            this.process.kill("SIGTERM");
            await this.process.status;
            this.process = null;
            logger.info("Cloudflare tunnel stopped.");
        }
    }
}
