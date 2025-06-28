import adze from "adze";
import { MetricsService } from "./services/MetricsService.ts";

const logger = adze.withEmoji.timestamp.seal();

export class AvatarServer {
    private server: Deno.HttpServer | null = null;
    private readonly port = 18888;
    private charactersDir: string;
    private isReady = false;

    constructor(charactersDir: string = "./characters") {
        // Resolve the absolute path to handle binary execution from different directories
        this.charactersDir = new URL(charactersDir, `file://${Deno.cwd()}/`).pathname;
    }

    /**
     * Start the avatar server
     */
    start(): void {
        try {
            this.server = Deno.serve({ port: this.port, hostname: "0.0.0.0" }, this.handleRequest.bind(this));
            logger.info(`Avatar server started on http://localhost:${this.port}`);
            logger.info(`Serving avatars from: ${this.charactersDir}`);
        } catch (error) {
            logger.error(`Failed to start avatar server: ${error}`);
        }
    }

    public setReady(isReady: boolean) {
        this.isReady = isReady;
    }

    /**
     * Stop the avatar server
     */
    async stop(): Promise<void> {
        if (this.server) {
            await this.server.shutdown();
            this.server = null;
            logger.info("Avatar server stopped");
        }
    }

    /**
     * Handle HTTP requests
     */
    private async handleRequest(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/metrics") {
            const html = await MetricsService.getMetricsHtml();
            return new Response(html, {
                status: 200,
                headers: { "Content-Type": "text/html" },
            });
        }

        if (url.pathname === "/healthz") {
            return new Response("OK", { status: 200 });
        }

        if (url.pathname === "/readyz") {
            if (this.isReady) {
                return new Response("OK", { status: 200 });
            } else {
                return new Response("Not Ready", { status: 503 });
            }
        }

        if (url.pathname === "/") {
            return new Response(null, {
                status: 302,
                headers: { "Location": "/metrics" },
            });
        }

        // Only handle avatar requests
        if (!url.pathname.startsWith("/avatars/")) {
            return new Response("Not Found", { status: 404 });
        }

        // Extract filename
        const filename = decodeURIComponent(url.pathname.substring("/avatars/".length));

        // Security: prevent directory traversal
        if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
            return new Response("Forbidden", { status: 403 });
        }

        // Only serve PNG files
        if (!filename.toLowerCase().endsWith(".png")) {
            return new Response("Not Found", { status: 404 });
        }

        try {
            const filePath = `${this.charactersDir}/${filename}`;
            const fileData = await Deno.readFile(filePath);

            return new Response(fileData, {
                status: 200,
                headers: {
                    "Content-Type": "image/png",
                    "Cache-Control": "public, max-age=3600", // Cache for 1 hour
                    "Access-Control-Allow-Origin": "*",
                },
            });
        } catch (error) {
            logger.warn(`Failed to serve avatar ${filename}: ${error}`);
            return new Response("Not Found", { status: 404 });
        }
    }
}
