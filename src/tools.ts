import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

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

interface Topic {
    Text: string;
}

export async function search_web(query: string): Promise<string> {
    try {
        // Using a simple DuckDuckGo search URL, as it doesn't require an API key.
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        const data = await response.json();
        if (data.AbstractText) {
            return data.AbstractText;
        } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            return data.RelatedTopics.map((topic: Topic) => topic.Text).join("\n");
        }
        return "No results found.";
    } catch (e) {
        const error = e as Error;
        return `Error searching web: ${error.message}`;
    }
}

export async function retrieve_url(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });
        const text = await response.text();
        const titleMatch = text.match(/<title>(.*?)<\/title>/);
        const title = titleMatch ? titleMatch[1] : "No title found";
        // Basic HTML stripping. A more robust solution might be needed for complex pages.
        const body = text.replace(/<[^>]*>/g, "").substring(0, 2000);
        return `Title: ${title}\n\n${body}`;
    } catch (e) {
        const error = e as Error;
        return `Error retrieving URL: ${error.message}`;
    }
}
