import adze from "adze";
import { configService } from "./ConfigService.ts";

const logger = adze.withEmoji.timestamp.seal();

export class CloudflareService {
    private process: Deno.ChildProcess | null = null;

    public async start(): Promise<void> {
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
                    "--token",
                    Deno.readTextFileSync(credentialsFile),
                ],
            }).spawn();
        } else {
            logger.info("Starting temporary Cloudflare tunnel");
            this.process = new Deno.Command("cloudflared", {
                args: [
                    "tunnel",
                    "--url",
                    "http://localhost:8080",
                ],
            }).spawn();
        }

        if (this.process) {
            this.process.status.then((status) => {
                if (!status.success) {
                    logger.error(`Cloudflared process exited with code: ${status.code}`);
                }
            });
        }
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
