import * as https from "node:https";
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { getJinaApiKey } from "./env.ts";

export const tools: FunctionDeclaration[] = [
    {
        name: "search_web",
        description: "Searches the web for information.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: {
                    type: SchemaType.STRING,
                    description: "The search query.",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "piss_yourself",
        description: "Makes u pee.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        },
    },
    {
        name: "retrieve_url",
        description: "Retrieves the text content of a webpage.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                url: {
                    type: SchemaType.STRING,
                    description: "The URL to retrieve.",
                },
            },
            required: ["url"],
        },
    },
];

export function piss_yourself() {
    return "I have pissed myself";
}

export function search_web(query: string) {
    const errorString = "Error searching web";
    try {
        const encodedSearch = encodeURI(query);
        const url = `https://s.jina.ai/?q=${encodedSearch}&hl=en`;
        const options = {
            headers: {
                "Authorization": "Bearer REDACTED_JINA_API_KEY",
                "X-Respond-With": "no-content",
            },
        };

        let data = "";
        https.get(url, options, (res) => {
            res.on("data", (chunk) => {
                data += chunk;
            });
        }).on("error", (err) => {
            console.error("Error: ", err.message);
            data = `${errorString}: ${err.message}`;
        });
        return data;
    } catch (e) {
        const error = e as Error;
        return `${errorString}: ${error.message}`;
    }
}

export async function retrieve_url(url: string): Promise<string> {
    try {
        return await new Promise((resolve, reject) => {
            const https = require("node:https");

            const options = {
                hostname: "r.jina.ai",
                path: `/${url}`,
                headers: {
                    "Accept": "text/event-stream",
                    "Authorization": `Bearer ${getJinaApiKey()}`,
                    "X-Base": "final",
                    "X-Engine": "browser",
                    "X-Md-Heading-Style": "setext",
                },
            };

            const req = https.get(options, (res: any) => {
                let rawData = "";
                res.on("data", (chunk: any) => {
                    rawData += chunk;
                });
                res.on("end", () => {
                    const lines = rawData.trim().split("\n");
                    const lastDataLine = lines.filter((line) => line.startsWith("data:")).pop();

                    if (lastDataLine) {
                        try {
                            const jsonString = lastDataLine.substring(5).trim();
                            const parsedData = JSON.parse(jsonString);
                            if (parsedData && parsedData.content) {
                                resolve(parsedData.content);
                                return;
                            }
                        } catch (e) {
                            // Not valid JSON, fall through to other checks
                            console.error(e);
                        }
                    }

                    if (rawData.includes("[DONE]")) {
                        resolve(rawData.substring(0, rawData.indexOf("[DONE]")).trim());
                    } else {
                        resolve(rawData);
                    }
                });
            });

            req.on("error", (e: Error) => {
                reject(e);
            });
        });
    } catch (e) {
        const error = e as Error;
        return `Error retrieving URL: ${error.message}`;
    }
}
