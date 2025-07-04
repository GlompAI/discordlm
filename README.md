# Discord LLM Bot

A Discord bot that integrates with multiple LLM providers, including Google's Gemini, OpenAI-compatible APIs, and Ollama, to provide AI responses in Discord channels and direct messages.

> **Recent Updates**: Added development tasks (`prepare`, `dev`, `check`, `lint`, `fmt`) and cleaned up deno.json configuration for better DX.

## Features

- Responds to mentions and direct messages
- Powered by multiple LLM providers (Gemini, OpenAI, Ollama)
- Configurable token limits for context management
- Graceful typing indicators while generating responses
- Automatic message history context
- Per-user rate limiting with configurable requests per minute
- Automatic queuing of rate-limited requests

## Setup

### Prerequisites

- [Deno](https://deno.land/) runtime installed
- A Discord bot token
- A Google Gemini API Key

### Installation

1. Clone this repository
2. Set up the required environment variables (see below)
3. Run the bot

```bash
# Development mode (with file watching)
deno task dev

# Or run directly
deno task start

# Or with all permissions (less secure)
deno run -A src/main.ts
```

### Development Tasks

The project includes several useful development tasks:

```bash
# Start the bot
deno task start

# Start in development mode with file watching
deno task dev

# Compile to a standalone binary
deno task prepare

# Type check the code
deno task check

# Lint the code
deno task lint

# Format the code
deno task fmt

# Check if code is properly formatted
deno task fmt:check
```

### Building for Production

To create a standalone executable:

```bash
deno task prepare
```

This will create a binary at `dist/discordlm` that can be run without having Deno installed.

### Environment Variables

The following environment variables are required:

| Variable                   | Description                                                         | Required                      | Default                     |
| -------------------------- | ------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| `BOT_TOKEN`                | Discord bot token from Discord Developer Portal                     | Yes                           | -                           |
| `LLM_PROVIDER`             | The LLM provider to use (`gemini`, `openai`, `ollama`)              | No                            | `gemini`                    |
| `GEMINI_MODEL_NAME`        | The model name to use for the Gemini provider                       | No                            | `gemini-2.5-flash`          |
| `OPENAI_MODEL_NAME`        | The model name to use for the OpenAI provider                       | No                            | `gpt-4-turbo`               |
| `GEMINI_API_KEY`           | Your Google Gemini API key                                          | Yes (if provider is `gemini`) | -                           |
| `GEMINI_BASE_URL`          | Custom base URL for the Gemini API                                  | No                            | -                           |
| `OPENAI_API_KEY`           | Your OpenAI API key                                                 | Yes (if provider is `openai`) | -                           |
| `OPENAI_BASE_URL`          | Custom base URL for the OpenAI API                                  | No                            | `https://api.openai.com/v1` |
| `OPENAI_VISION_SUPPORT`    | Enable vision support for OpenAI-compatible APIs                    | No                            | `false`                     |
| `OPENAI_CUSTOM_HEADER_KEY` | Custom header for OpenAI-compatible APIs                            | No                            | `x-api-key`                 |
| `OLLAMA_HOST`              | The host for the Ollama API                                         | No                            | `http://localhost:11434`    |
| `GEMINI_TOKEN_LIMIT`       | Maximum token context to send to the Gemini API                     | No                            | `1000000`                   |
| `OPENAI_TOKEN_LIMIT`       | Maximum token context to send to the OpenAI API                     | No                            | `32768`                     |
| `MAX_HISTORY_MESSAGES`     | Maximum number of messages to fetch for history                     | No                            | `300`                       |
| `RATE_LIMIT_PER_MINUTE`    | Maximum requests per user per minute                                | No                            | `4`                         |
| `LIMIT_USER_IDS`           | Semicolon-separated list of user IDs to apply a lower rate limit to | No                            | -                           |
| `INFERENCE_PARALLELISM`    | Number of parallel inference requests to allow                      | No                            | `10`                        |
| `ADMIN_OVERRIDE_ID`        | User ID to bypass administrator checks                              | No                            | -                           |
| `ENABLE_AVATAR_SERVER`     | Enable the avatar server for webhooks                               | No                            | `false`                     |
| `AVATAR_PORT`              | Port for the avatar server                                          | No                            | `8080`                      |
| `PUBLIC_AVATAR_BASE_URL`   | Publicly accessible base URL for the avatar server                  | No                            | -                           |
| `DEBUG`                    | Enable debug logging                                                | No                            | `false`                     |

### Example Environment Setup

Create a `.env` file or set environment variables:

```bash
export BOT_TOKEN="your_discord_bot_token_here"
export GEMINI_API_KEY="your_gemini_api_key_here"
export GEMINI_MODEL_NAME="models/gemini-2.5-flash"
```

### Docker

You can also run the bot using Docker for easy deployment:

```bash
# Build the Docker image
docker build -t discordlm .

# Run the container with environment variables
docker run -d \
  -e BOT_TOKEN="your_discord_bot_token" \
  -e GEMINI_API_KEY="your_gemini_api_key" \
  -e GEMINI_MODEL_NAME="models/gemini-2.5-flash" \
  -v /path/to/your/characters:/app/characters \
  -v /path/to/your/logs:/app/logs \
  --name discordlm-bot \
  --restart=always \
  discordlm
```

Or using docker-compose, create a `docker-compose.yml` file:

```yaml
version: "3.8"
services:
    discordlm:
        build: .
        environment:
            - BOT_TOKEN=your_discord_bot_token
            - GEMINI_API_KEY=your_gemini_api_key
            - GEMINI_MODEL_NAME=models/gemini-2.5-flash
        volumes:
            - ./characters:/app/characters
            - ./logs:/app/logs
        restart: unless-stopped
```

Then run with:

```bash
docker-compose up -d
```

## Usage

1. Invite the bot to your Discord server with appropriate permissions (Send Messages, Read Message History)
2. Mention the bot in a channel or send it a direct message
3. The bot will respond using the configured AI model

## Rate Limiting

The bot includes a per-user rate limiting system to prevent abuse:

- **Default limit**: 4 requests per minute per user
- **Configurable**: Set `RATE_LIMIT_PER_MINUTE` environment variable
- **Special Limit**: A lower rate limit (half of the default) can be applied to a semicolon-separated list of user IDs set in the `LIMIT_USER_IDS` environment variable.
- **User feedback**: Users receive a temporary message when rate limited
- **Automatic queuing**: Rate-limited requests are queued and processed when the limit resets
- **In-memory storage**: Rate limits are stored in memory and reset on bot restart

When a user exceeds the rate limit, they'll see a message like:

```
⏱️ Rate limited. Try again in 45s.
```

The message automatically deletes after 5 seconds, and their request will be processed automatically when the rate limit window resets.

## Premium Features

The bot now supports a premium tier, granting special access and features to users with a specific role in a designated guild.

- **DM Access**: Only premium users can interact with the bot in Direct Messages.
- **Message Deletion**: Only premium users can delete the bot's messages in DMs.
- **Message Limit**: Non-premium users are limited to 10 messages from the bot in DMs. After reaching this limit, they will receive a message prompting them to subscribe.

These features are managed by checking for a specific role (`Super Glomper`) in a designated guild (`1304097485136072714`).

## Permissions Required

The bot needs the following Discord permissions:

- Read Messages
- Send Messages
- Read Message History
- Use Slash Commands (if applicable)

## License

See LICENSE.md for licensing information.
