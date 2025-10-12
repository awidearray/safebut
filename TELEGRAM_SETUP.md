# Telegram Bot Setup Instructions

## Fix "Bot domain invalid" Error

The Telegram login widget requires your bot to be configured with your domain. Follow these steps:

### 1. Configure Bot with @BotFather

1. Open Telegram and search for @BotFather
2. Send the following commands:

```
/mybots
```

3. Select your bot: **safebutbot**

4. Click **Bot Settings**

5. Click **Domain**

6. Send your domain:
```
safebut.com
```

### 2. Verify Environment Variables in Vercel

Make sure these are set:
```
TELEGRAM_BOT_TOKEN=7824977357:AAES9HP_EOVL_fxH6ZF93UdeQGL1qG8dJZw
TELEGRAM_BOT_USERNAME=safebutbot
```

### 3. Alternative: Use Direct Link Method

If the widget still doesn't work, we can use a direct Telegram link approach:

1. The bot needs to be started first
2. Users click a link to open Telegram
3. They authorize the bot
4. Bot sends them back with auth data

### Important Notes

- The bot username must be **lowercase** in the widget: `safebutbot` not `SafeButBot`
- The domain must match exactly what's configured in @BotFather
- The bot must be public (not private)

### Testing the Bot

Send this to @BotFather to check current settings:
```
/mybots
Select: safebutbot
Select: Bot Settings
Check: Domain
```

If domain shows "not set", that's the issue!