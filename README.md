# Discord LLM Bot

A Discord bot that integrates with OpenAI-compatible language model endpoints to provide AI responses in Discord channels and direct messages.

> **Recent Updates**: Added development tasks (`prepare`, `dev`, `check`, `lint`, `fmt`) and cleaned up deno.json configuration for better DX.

## Features

- Responds to mentions and direct messages
- Supports any OpenAI-compatible API endpoint
- Configurable token limits for context management
- Graceful typing indicators while generating responses
- Automatic message history context
- Per-user rate limiting with configurable requests per minute
- Automatic queuing of rate-limited requests

## Setup

### Prerequisites

- [Deno](https://deno.land/) runtime installed
- A Discord bot token
- Access to an OpenAI-compatible API endpoint

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

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `BOT_TOKEN` | Discord bot token from Discord Developer Portal | Yes | - |
| `BOT_SELF_ID` | Discord snowflake ID of the bot itself | Yes | - |
| `OPENAI_URL` | Base URL for the OpenAI-compatible API endpoint | Yes | - |
| `MODEL_NAME` | Model name to use on the API endpoint | Yes | - |
| `OPENAI_KEY` | API key for the OpenAI-compatible endpoint | Yes | - |
| `TOKEN_LIMIT` | Maximum token context to send to the API | No | 32600 |
| `INFERENCE_PARALLELISM` | Number of parallel inference requests to allow | No | 1 |
| `RATE_LIMIT_PER_MINUTE` | Maximum requests per user per minute | No | 10 |
| `ADMIN_OVERRIDE_ID` | User ID to bypass administrator checks | No | - |
| `MAX_HISTORY_MESSAGES` | Maximum number of messages to fetch for history | No | 200 |
| `DEBUG` | Enable debug logging | No | false |

### Getting Discord Bot Information

1. **Bot Token**: Create a bot at [Discord Developer Portal](https://discord.com/developers/applications)
2. **Bot Self ID**: You can get this by:
   - Right-clicking on your bot in Discord and selecting "Copy ID" (requires Developer Mode enabled)
   - Or from the Discord Developer Portal under your bot's General Information

### Example Environment Setup

Create a `.env` file or set environment variables:

```bash
export BOT_TOKEN="your_discord_bot_token_here"
export BOT_SELF_ID="1234567890123456789"
export OPENAI_URL="https://api.openai.com/v1"
export MODEL_NAME="gpt-4"
export OPENAI_KEY="your_api_key_here"
export TOKEN_LIMIT="32000"
```

### Docker

You can also run the bot using Docker for easy deployment:

```bash
# Build the Docker image
docker build -t discordlm .

# Run the container with environment variables
docker run -d \
  -e BOT_TOKEN="your_discord_bot_token" \
  -e BOT_SELF_ID="1234567890123456789" \
  -e OPENAI_URL="https://api.openai.com/v1" \
  -e MODEL_NAME="gpt-4" \
  -e OPENAI_KEY="your_api_key" \
  -e TOKEN_LIMIT="32000" \
  --name discordlm-bot \
  discordlm
```

Or using docker-compose, create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  discordlm:
    build: .
    environment:
      - BOT_TOKEN=your_discord_bot_token
      - BOT_SELF_ID=1234567890123456789
      - OPENAI_URL=https://api.openai.com/v1
      - MODEL_NAME=gpt-4
      - OPENAI_KEY=your_api_key
      - TOKEN_LIMIT=32000
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

- **Default limit**: 10 requests per minute per user
- **Configurable**: Set `RATE_LIMIT_PER_MINUTE` environment variable
- **User feedback**: Users receive a temporary message when rate limited
- **Automatic queuing**: Rate-limited requests are queued and processed when the limit resets
- **In-memory storage**: Rate limits are stored in memory and reset on bot restart

When a user exceeds the rate limit, they'll see a message like:
```
⏱️ Rate limited. Try again in 45s.
```

The message automatically deletes after 5 seconds, and their request will be processed automatically when the rate limit window resets.

## Permissions Required

The bot needs the following Discord permissions:
- Read Messages
- Send Messages
- Read Message History
- Use Slash Commands (if applicable)

## License

See LICENSE.md for licensing information.

