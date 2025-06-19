FROM denoland/deno AS builder
WORKDIR /app

# Copy source code
COPY . .

# Install dependencies and build binary
RUN apt update && apt install -y unzip && rm -rf /var/lib/apt/lists/*
RUN deno task prepare

# Production stage
FROM debian:stable-slim
WORKDIR /app

# Copy the compiled binary from builder stage
COPY --from=builder /app/dist/discordlm ./discordlm

# Make binary executable
RUN chmod +x ./discordlm

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

ENTRYPOINT ["./discordlm"]
