FROM denoland/deno
WORKDIR /app

# Copy source code
COPY . .

# Install dependencies
RUN deno cache --reload src/main.ts

# Environment variables that need to be set:
# BOT_TOKEN - Discord bot token (required)
# BOT_SELF_ID - Discord bot's user ID (required) 
# OPENAI_URL - OpenAI-compatible API endpoint URL (required)
# MODEL_NAME - Model name to use (required)
# OPENAI_KEY - API key for the endpoint (required)
# TOKEN_LIMIT - Maximum token context (optional, default: 32600)
# ENABLE_AVATAR_SERVER - Enable avatar server (optional, default: false)
# AVATAR_PORT - Avatar server port (optional, default: 8080)
# PUBLIC_AVATAR_BASE_URL - Public URL for avatars (optional, for Discord webhooks)

# Create characters directory
RUN mkdir -p /app/characters

ENTRYPOINT ["deno", "run", "--unstable-kv", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "src/main.ts"]
