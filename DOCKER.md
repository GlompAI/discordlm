# Docker Deployment Guide

This guide covers how to run the Discord LM bot using Docker with proper character file mounting.

## Quick Start

1. **Create your `.env` file** (copy from `.env.example` and fill in your values):

```bash
cp .env.example .env
# Edit .env with your Discord bot token, OpenAI credentials, etc.
```

2. **Create your characters directory**:

```bash
mkdir -p characters
# Add your character PNG/JSON files to the characters/ directory
```

3. **Run with Docker Compose**:

```bash
docker-compose up -d
```

## Character File Mounting

### Option 1: Default Setup (Recommended)

Place your character files in the `./characters` directory:

```
discordlm/
├── characters/
│   ├── alice.png          # PNG character card with embedded data
│   ├── bob.json           # JSON character card
│   ├── bob.png            # Avatar for bob.json
│   └── charlie.png        # Another PNG character card
├── docker-compose.yml
└── .env
```

### Option 2: Custom Directory

Edit `docker-compose.yml` to mount from a different location:

```yaml
volumes:
    - /path/to/your/characters:/app/characters:ro
```

For example:

```yaml
volumes:
    - /home/user/my-characters:/app/characters:ro
    - /mnt/nas/character-library:/app/characters:ro
```

### Option 3: Multiple Character Sources

Mount multiple directories:

```yaml
volumes:
    - ./characters:/app/characters:ro
    - ./extra-characters:/app/extra-characters:ro
```

Note: The bot currently only reads from `/app/characters`, so you'd need to organize all characters there.

## Environment Variables

### Required Variables

```env
BOT_TOKEN=your_discord_bot_token
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
GEMINI_MODEL_NAME=gemini-2.5-flash
OPENAI_MODEL_NAME=gpt-4-turbo
```

### Optional Variables

```env
GEMINI_TOKEN_LIMIT=1000000
OPENAI_TOKEN_LIMIT=32768
ENABLE_AVATAR_SERVER=true
AVATAR_PORT=8080
PUBLIC_AVATAR_BASE_URL=https://your-domain.com/avatars
```

## Deployment Options

### Production Deployment

```bash
# Build and run the optimized container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Development Mode

```bash
# Run with live reload (mounts source code)
docker-compose --profile dev up -d

# This gives you:
# - Live code reloading
# - Source code mounted for editing
# - Same character mounting as production
```

### Avatar Server with Docker

If you're using the avatar server feature, you'll need to:

1. **Enable the avatar server**:

```env
ENABLE_AVATAR_SERVER=true
AVATAR_PORT=8080
```

2. **Set up public access** (for Discord webhooks to display avatars):

#### Option A: Using a reverse proxy (nginx, caddy, etc.)

```env
PUBLIC_AVATAR_BASE_URL=https://avatars.yourdomain.com
```

Configure your reverse proxy to forward `https://avatars.yourdomain.com/*` to `http://container:8080/*`

#### Option B: Using ngrok for development

```bash
# In another terminal
ngrok http 8080

# Copy the https URL to your .env
PUBLIC_AVATAR_BASE_URL=https://abc123.ngrok.io
```

## Building Custom Images

### Build locally:

```bash
docker build -t discordlm .
```

### Build with specific tags:

```bash
docker build -t discordlm:latest -t discordlm:v1.0 .
```

### Multi-platform build:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t discordlm .
```

## Troubleshooting

### Character files not loading

- Check that the `characters` directory is properly mounted
- Verify file permissions (should be readable by container)
- Check logs: `docker-compose logs discordlm`

### Avatar server issues

- Ensure `AVATAR_PORT` matches between environment and port mapping
- Check firewall rules if accessing from outside
- Verify `PUBLIC_AVATAR_BASE_URL` is accessible from Discord's servers

### Environment variable issues

- Ensure `.env` file exists and has correct values
- Check that sensitive values aren't quoted if they contain special characters
- Verify Docker can access the `.env` file

### Container won't start

```bash
# Check build logs
docker-compose build --no-cache

# Check runtime logs  
docker-compose logs discordlm

# Enter container for debugging
docker-compose exec discordlm /bin/bash
```

## Examples

### Simple Setup with Local Characters

```bash
# Create characters directory
mkdir characters
# Add some character files...

# Create .env file
echo "BOT_TOKEN=your_token_here" > .env
# ... add other required vars

# Run
docker-compose up -d
```

### Setup with Avatar Server

```bash
# Enable avatar server
echo "ENABLE_AVATAR_SERVER=true" >> .env
echo "AVATAR_PORT=8080" >> .env
echo "PUBLIC_AVATAR_BASE_URL=https://yourdomain.com" >> .env

# Run with port exposed
docker-compose up -d

# Avatar files will be served at: https://yourdomain.com/avatars/filename.png
```

### Production Deployment on VPS

```bash
# Clone repository
git clone https://github.com/your-repo/discordlm
cd discordlm

# Setup environment
cp .env.example .env
# Edit .env with production values

# Setup characters
mkdir characters
# Upload your character files

# Setup reverse proxy (nginx example)
# Configure nginx to proxy /avatars/* to localhost:8080/*

# Deploy
docker-compose up -d

# Setup auto-restart on boot
# Add to crontab: @reboot cd /path/to/discordlm && docker-compose up -d
```
