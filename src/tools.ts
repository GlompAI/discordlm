export interface Tool {
    name: string;
    description: string;
    parameters: {
        name: string;
        type: string;
        description: string;
    }[];
}

export const tools: Tool[] = [
    {
        name: "search_web",
        description: "Searches the web for information.",
        parameters: [
            {
                name: "query",
                type: "string",
                description: "The search query.",
            },
        ],
    },
    {
        name: "retrieve_url",
        description: "Retrieves the text content of a webpage.",
        parameters: [
            {
                name: "url",
                type: "string",
                description: "The URL to retrieve.",
            },
        ],
    },
];

export async function search_web(query: string): Promise<string> {
    try {
        // Using a simple DuckDuckGo search URL, as it doesn't require an API key.
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        const data = await response.json();
        if (data.AbstractText) {
            return data.AbstractText;
        } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            return data.RelatedTopics.map((topic: any) => topic.Text).join("\n");
        }
        return "No results found.";
    } catch (e) {
        const error = e as Error;
        return `Error searching web: ${error.message}`;
    }
}

export async function retrieve_url(url: string): Promise<string> {
    try {
        const response = await fetch(url);
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
