# 🔒 SECURITY GUIDE

## Environment Variables Setup

### 📱 For Local Development:
1. Copy `.env.example` to `.env`
2. Fill in your actual values
3. **NEVER commit `.env` to GitHub**

### ☁️ For Railway Deployment:
1. Go to Railway Dashboard → Variables
2. Add these environment variables:

```
DISCORD_TOKEN=MTxxx.xxx.xxx
ADMIN_USER_IDS=123456789012345678
NODE_ENV=production  
PORT=8080
```

## 🚨 Security Checklist

- ✅ No hardcoded tokens in source code
- ✅ `.env` file is in `.gitignore`  
- ✅ Use Railway Environment Variables for production
- ✅ Reset Discord token if accidentally exposed
- ✅ Private GitHub repository (recommended)

## 🔑 Getting Discord Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to "Bot" tab
4. Click "Reset Token" (if needed)
5. Copy the new token
6. Add to Railway Variables: `DISCORD_TOKEN=MTxxx.xxx.xxx`

## 👑 Getting Admin User ID

1. Enable Developer Mode in Discord Settings
2. Right-click your username → Copy User ID
3. Add to Railway Variables: `ADMIN_USER_IDS=123456789012345678`

## 🛡️ Best Practices

- Never share tokens in chat/email
- Use different tokens for dev/prod environments
- Regularly rotate tokens
- Monitor GitHub security alerts
- Keep dependencies updated

---

**Remember: Security is not optional!** 🔐