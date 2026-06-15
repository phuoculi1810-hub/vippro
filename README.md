# 🎮 Asura Scanner System V2

Advanced Roblox Asura game server scanner with thread-safe API and Discord bot integration.

## 🚀 Features

- **Thread-Safe JobId Scanner** - Multiple script instances can run simultaneously
- **Discord Bot Integration** - Search players, gangs, boss/rift servers with key system
- **Auto Server Age Detection** - Automatically cleans data from servers ≥38 hours old
- **Usage Logging & Statistics** - Track command usage and bot statistics
- **Railway.app Deployment** - Ready for cloud hosting

## 🏗️ Architecture

```
system_new/
├── rift.js                 # Brain Central API Server
├── combined-server.js      # Production server (API + Discord Bot)
├── discord-bot/
│   ├── bot.js             # Discord bot with full functionality
│   └── package.json       # Bot dependencies
├── scripts/
│   └── asura_scanner_v2.lua # Lua script for game integration
├── api/
│   └── jobid-scanner.js   # Thread-safe JobId management
└── config/
    └── config.json        # Configuration settings
```

## 🔧 Setup

### Environment Variables
```bash
DISCORD_TOKEN=your_discord_bot_token
ADMIN_USER_IDS=your_discord_user_id
BRAIN_URL=your_railway_app_url
NODE_ENV=production
```

### Installation
```bash
npm install
npm run start
```

## 📡 API Endpoints

- `GET /status` - System status and JobId queue
- `POST /scan-jobids` - Submit new JobIds for scanning
- `GET /next/:threadId` - Get JobId for specific thread
- `POST /complete` - Mark JobId as completed
- `GET /player?name=username` - Search player
- `GET /gang?name=gangname` - Search gang
- `GET /boss` - Find boss servers
- `GET /rift` - Find rift servers
- `POST /clear-data` - Clear database (admin)

## 🤖 Discord Bot Commands

- `/username <player> <key>` - Search for players
- `/gang <name> <key>` - Search for gangs  
- `/boss <key>` - Find servers with boss spawning
- `/rift <key>` - Find servers with rift spawning
- `/createkey` - [ADMIN] Create usage/time keys
- `/keyusage <key>` - Check key usage statistics
- `/stats` - [ADMIN] View bot statistics
- `/test` - Bot status check

## 🎯 Game Integration

The Lua script connects to the API to:
1. Get JobIds from the queue
2. Scan servers for players, gangs, and events
3. Auto-hop between servers
4. Report data back to the central database

## 🔐 Security Features

- Environment variable validation
- Admin-only commands protection
- Key-based usage system with limits
- Automatic data cleanup based on server age
- No hardcoded tokens in source code

## 📊 Data Management

- **Auto Cleanup**: Servers ≥38 hours old are automatically cleaned every 6 hours
- **Manual Clear**: Admin commands for targeted data cleanup
- **Usage Tracking**: All command usage is logged for statistics
- **Key System**: Per-user and per-key usage limits

## 🚀 Deployment

This system is designed for Railway.app deployment with automatic builds and environment variable management.

---

**Project Status**: ✅ Production Ready  
**Last Updated**: June 2026  
**Version**: 2.0.0