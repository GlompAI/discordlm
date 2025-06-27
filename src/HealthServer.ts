import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

export class HealthServer {
    private isReady = false;

    public setReady(isReady: boolean) {
        this.isReady = isReady;
    }

    public start() {
        serve((req: Request) => {
            const url = new URL(req.url);
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
            return new Response("Not Found", { status: 404 });
        }, { port: 8081 });
    }
}
