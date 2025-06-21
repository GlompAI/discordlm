import adze from "npm:adze";

const logger = adze.withEmoji.timestamp.seal();

export class AvatarServer {
    private server: Deno.HttpServer | null = null;
    private port: number;
    private charactersDir: string;

    constructor(port: number = 8080, charactersDir: string = "./characters") {
        this.port = port;
        // Resolve the absolute path to handle binary execution from different directories
        this.charactersDir = new URL(charactersDir, `file://${Deno.cwd()}/`).pathname;
    }

    /**
     * Start the avatar server
     */
    async start(): Promise<void> {
        try {
            this.server = Deno.serve({ port: this.port }, this.handleRequest.bind(this));
            logger.info(`Avatar server started on http://localhost:${this.port}`);
            logger.info(`Serving avatars from: ${this.charactersDir}`);
        } catch (error) {
            logger.error(`Failed to start avatar server: ${error}`);
        }
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
