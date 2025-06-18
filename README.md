# Discord LLM Bot

A Discord bot that integrates with OpenAI-compatible language model endpoints to provide AI responses in Discord channels and direct messages.

## Features

- Responds to mentions and direct messages
- Supports any OpenAI-compatible API endpoint
- Configurable token limits for context management
- Graceful typing indicators while generating responses
- Automatic message history context

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
deno run -A src/main.ts
```

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

## Usage

1. Invite the bot to your Discord server with appropriate permissions (Send Messages, Read Message History)
2. Mention the bot in a channel or send it a direct message
3. The bot will respond using the configured AI model

## Permissions Required

The bot needs the following Discord permissions:
- Read Messages
- Send Messages
- Read Message History
- Use Slash Commands (if applicable)

## License

See LICENSE.md for licensing information.

