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

        const requestsPerCharacter = metrics.reduce((acc, m) => {
            acc[m.character] = (acc[m.character] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const avgResponseTimePerCharacter = metrics.reduce((acc, m) => {
            if (m.llmResponseTime) {
                if (!acc[m.character]) {
                    acc[m.character] = { total: 0, count: 0 };
                }
                acc[m.character].total += m.llmResponseTime;
                acc[m.character].count++;
            }
            return acc;
        }, {} as Record<string, { total: number; count: number }>);

        const characterLabels = Object.keys(requestsPerCharacter);
        const requestCounts = Object.values(requestsPerCharacter);
        const avgResponseTimes = characterLabels.map(
            (char) => (avgResponseTimePerCharacter[char].total / avgResponseTimePerCharacter[char].count).toFixed(2),
        );

        const requestsPerUser = metrics.reduce((acc, m) => {
            acc[m.username] = (acc[m.username] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const userLabels = Object.keys(requestsPerUser);
        const userRequestCounts = Object.values(requestsPerUser);

        const requestsPerGuild = metrics.reduce((acc, m) => {
            if (m.guildName) {
                acc[m.guildName] = (acc[m.guildName] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
        const guildLabels = Object.keys(requestsPerGuild);
        const guildRequestCounts = Object.values(requestsPerGuild);

        const requestsPerChannel = metrics.reduce((acc, m) => {
            if (m.channelName) {
                acc[m.channelName] = (acc[m.channelName] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
        const channelLabels = Object.keys(requestsPerChannel);
        const channelRequestCounts = Object.values(requestsPerChannel);

        return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Discord LM Metrics</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
            table { border-collapse: collapse; width: 80%; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background-color: #f2f2f2; }
            .chart-container { width: 80%; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Discord LM Metrics</h1>

          <div class="chart-container">
            <canvas id="requestsPerCharacterChart"></canvas>
          </div>
          <div class="chart-container">
            <canvas id="avgResponseTimePerCharacterChart"></canvas>
          </div>
          <div class="chart-container">
            <canvas id="requestsPerUserChart"></canvas>
          </div>
          <div class="chart-container">
            <canvas id="requestsPerGuildChart"></canvas>
          </div>
          <div class="chart-container">
            <canvas id="requestsPerChannelChart"></canvas>
          </div>

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
        <script>
          const requestsCtx = document.getElementById('requestsPerCharacterChart').getContext('2d');
          new Chart(requestsCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(characterLabels)},
              datasets: [{
                label: '# of Requests per Character',
                data: ${JSON.stringify(requestCounts)},
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
              }]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });

          const responseTimeCtx = document.getElementById('avgResponseTimePerCharacterChart').getContext('2d');
          new Chart(responseTimeCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(characterLabels)},
              datasets: [{
                label: 'Avg LLM Response Time (ms) per Character',
                data: ${JSON.stringify(avgResponseTimes)},
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
              }]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });

          const userCtx = document.getElementById('requestsPerUserChart').getContext('2d');
          new Chart(userCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(userLabels)},
              datasets: [{
                label: '# of Requests per User',
                data: ${JSON.stringify(userRequestCounts)},
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
              }]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });

          const guildCtx = document.getElementById('requestsPerGuildChart').getContext('2d');
          new Chart(guildCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(guildLabels)},
              datasets: [{
                label: '# of Requests per Guild',
                data: ${JSON.stringify(guildRequestCounts)},
                backgroundColor: 'rgba(255, 159, 64, 0.2)',
                borderColor: 'rgba(255, 159, 64, 1)',
                borderWidth: 1
              }]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });

          const channelCtx = document.getElementById('requestsPerChannelChart').getContext('2d');
          new Chart(channelCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(channelLabels)},
              datasets: [{
                label: '# of Requests per Channel',
                data: ${JSON.stringify(channelRequestCounts)},
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
              }]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        </script>
      </html>
    `;
    }
}
