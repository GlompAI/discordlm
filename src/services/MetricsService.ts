import { Guild, GuildTextBasedChannel, User } from "npm:discord.js";

const kv = await Deno.openKv("./logs/metrics.kv");

export interface IMetric {
    timestamp: number;
    username: string;
    userId: string;
    character: string;
    channelName?: string;
    channelId?: string;
    guildName?: string;
    guildId?: string;
    isNsfw: boolean;
    llmResponseTime?: number;
    llmRequestTimestamp?: number;
}

export class MetricsService {
    public static async record(metric: Omit<IMetric, "timestamp">) {
        const timestamp = Date.now();
        await kv.set(["metrics", timestamp], { ...metric, timestamp });
    }

    public static async getMetrics() {
        const iter = kv.list<IMetric>({ prefix: ["metrics"] });
        const metrics: IMetric[] = [];
        for await (const res of iter) {
            metrics.push(res.value);
        }
        return metrics.sort((a, b) => b.timestamp - a.timestamp);
    }

    public static async getMetricsHtml() {
        const metrics = await this.getMetrics();
        return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Discord LM Metrics</title>
          <style>
            body { font-family: sans-serif; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Discord LM Metrics</h1>
          <table>
            <tr>
              <th>Timestamp</th>
              <th>Username</th>
              <th>User ID</th>
              <th>Character</th>
              <th>Guild</th>
              <th>Channel</th>
              <th>NSFW</th>
              <th>LLM Request Time</th>
              <th>LLM Response Time (ms)</th>
            </tr>
            ${
            metrics
                .map(
                    (m) => `
              <tr>
                <td>${new Date(m.timestamp).toISOString()}</td>
                <td>${m.username}</td>
                <td>${m.userId}</td>
                <td>${m.character}</td>
                <td>${m.guildName || "N/A"} (${m.guildId || "N/A"})</td>
                <td>${m.channelName || "N/A"} (${m.channelId || "N/A"})</td>
                <td>${m.isNsfw}</td>
                <td>${m.llmRequestTimestamp ? new Date(m.llmRequestTimestamp).toISOString() : "N/A"}</td>
                <td>${m.llmResponseTime ? m.llmResponseTime.toFixed(2) : "N/A"}</td>
              </tr>
            `,
                )
                .join("")
        }
          </table>
        </body>
      </html>
    `;
    }
}
