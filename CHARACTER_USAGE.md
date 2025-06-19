# Multi-Character System Usage Guide

The Discord bot now supports multiple characters through PNG character cards with embedded metadata and automatic webhook creation.

## Quick Start

1. **Add Character Cards**: Place your PNG character card files in the `characters/` directory
2. **Start the Bot**: Run the bot as usual - it will automatically load all characters
3. **Use Commands**: Use bot commands to switch between characters and interact

## Character Card Format

Character cards should be PNG files with character data embedded in PNG tEXt chunks with the key "chara". The character data should be base64-encoded JSON following this format:

```json
{
    "char_name": "Character Name",
    "char_persona": "Character personality description",
    "world_scenario": "Setting/scenario description", 
    "char_greeting": "Initial greeting message",
    "example_dialogue": "Example conversations",
    "name": "Character Name",
    "description": "Character description",
    "personality": "Personality traits",
    "scenario": "Current scenario",
    "first_mes": "First message",
    "mes_example": "Message examples"
}
```

## Commands

- `!list` or `!chars` - List all available characters and show current active character
- `!switch [CharacterName]` - Switch the active character for this channel
- `!char [CharacterName] [message]` - Temporarily switch to a character and send a message

## Features

### Webhook Integration
- Each character automatically gets their own Discord webhook in guild channels
- Messages appear with the character's name as the sender
- Profile pictures can be configured via URLs (see Avatar Configuration below)
- **Note**: DMs (Direct Messages) cannot use webhooks and will fall back to regular bot replies

### Per-Channel Character Selection
- Each Discord channel can have its own active character
- Character selection persists until changed
- Falls back to the first loaded character as default

### Avatar Configuration

The system automatically detects and serves character avatars using smart file naming conventions. **No character card editing required!**

**Option 1: PNG Character Cards (Recommended)**
For PNG character cards, the PNG file itself is automatically used as the avatar:
```
characters/
├── alice.png          ← Character card with embedded data + used as avatar
├── bob.png            ← Character card with embedded data + used as avatar
└── charlie.png        ← Character card with embedded data + used as avatar
```

**Option 2: JSON + PNG Avatar Files**
For JSON character cards, place a PNG file with the same base name:
```
characters/
├── alice.json         ← Character card data
├── alice.png          ← Avatar (automatically detected)
├── bob.json           ← Character card data
└── bob.png            ← Avatar (automatically detected)
```

**Option 3: External URL Avatars**
If you want to use external URLs, add `avatarUrl` to your character card JSON:
```json
{
    "name": "Character Name",
    "avatarUrl": "https://example.com/avatar.png",
    ...
}
```

**Setup for Discord Webhook Avatars:**

1. **Enable the avatar server** in your `.env` file:
```env
ENABLE_AVATAR_SERVER=true
AVATAR_PORT=8080
```

2. **Set up a public URL** (required for Discord webhooks to display avatars):
```env
PUBLIC_AVATAR_BASE_URL=https://your-public-url.com
```

**Public URL Setup Options:**

- **Development (ngrok)**: Run `ngrok http 8080` and use the HTTPS URL
- **Production (reverse proxy)**: Set up nginx/caddy to proxy to localhost:8080 with TLS
- **CDN/Cloud**: Upload avatars to a CDN and set the base URL accordingly

## Examples

### Switching Characters
```
User: !switch Alice
Bot: Switched to Alice

User: Hello there!
Alice: *waves enthusiastically* Hi! How are you doing today?
```

### Inline Character Selection
```
User: !char Bob How's the weather?
Bob: *looks outside* Pretty cloudy today, but not too bad for a walk.
```

### Listing Characters
```
User: !list
Bot: Available characters: **Alice** (current), Bob, Charlie
```

## Technical Details

### Character Loading
- Characters are loaded on bot startup from the `characters/` directory
- Only PNG files are processed
- Invalid or missing character data is logged and skipped
- The first successfully loaded character becomes the default

### Webhook Management
- Webhooks are created automatically per character per channel
- Webhook names match character names
- Webhooks are cached and reused
- Failed webhook operations fall back to regular bot replies

### Error Handling
- Missing character data: Bot continues with available characters
- Webhook creation failures: Falls back to regular bot replies
- DM conversations: Always use regular bot replies (webhooks not supported)
- Invalid commands: Provides helpful error messages with available options

## Troubleshooting

**No characters loaded**: Check that PNG files are in the `characters/` directory and contain valid character data

**Webhook creation failed**: Ensure the bot has "Manage Webhooks" permission in the Discord server

**Character not found**: Use `!list` to see available characters and check spelling

**Avatar not showing**: Ensure `avatarUrl` is a valid HTTP/HTTPS URL, or consider setting up an HTTP server for local files

**Character name not showing in DMs**: This is expected - DMs cannot use webhooks, so all replies will appear as the bot itself

