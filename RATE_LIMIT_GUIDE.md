# Rate Limit Handling Guide

## What is Rate Limiting?

When you scan JobIds too frequently, Roblox API returns a **429 error** (Too Many Requests). This is called "rate limiting" - Roblox temporarily blocks your requests to prevent abuse.

## How the System Handles It

### Automatic 20-Minute Delay

When rate limited:
1. System detects 429 error from Roblox
2. Sets internal timer for **20 minutes**
3. All `/scan` attempts during this period are rejected
4. After 20 minutes, scanning resumes automatically

### Console Messages

```
⚠️ Rate Limit: Bị Roblox chặn. Đợi 20 phút trước khi quét lại.
⏰ Có thể quét lại sau: 14:35:00
```

### Discord Bot Response

When you try `/scan` during rate limit:

```
⏳ Rate Limited

Roblox API is rate limiting. Please wait 20 minutes before scanning again.

Available JobIds: 150
Tip: Use /jobid to manually add JobIds
```

## Manual JobId Addition (Workaround)

Instead of waiting 20 minutes, you can **manually add JobIds**:

### Method 1: Discord Command (Recommended)

```
/jobid list:123456789, 987654321, 555666777
```

**Response**:
```
📥 JobIds Added Manually

Total Submitted: 3
Added to Queue: 2
Skipped: 1

Skipped JobIds:
`12345678...` - already used
```

### Method 2: API Call

```bash
curl -X POST https://vippro-production-0683.up.railway.app/add-jobids \
  -H "Content-Type: application/json" \
  -d '{"jobIds": ["123456789", "987654321"]}'
```

**Response**:
```json
{
  "success": true,
  "added": 2,
  "skipped": 0,
  "details": {
    "added": ["123456789", "987654321"],
    "skipped": []
  }
}
```

## Why JobIds Get Skipped

When manually adding, JobIds may be skipped for these reasons:

| Reason | Explanation | Solution |
|--------|-------------|----------|
| `already used` | This JobId was already scanned | Normal - find new JobId |
| `already in queue` | Already waiting to be scanned | Normal - no action needed |
| `currently scanning` | Being scanned right now | Wait or use different JobId |

## Best Practices

### 1. Monitor Available JobIds

Check status before scanning:
```
https://vippro-production-0683.up.railway.app/status
```

```json
{
  "scanner": {
    "available": 150,
    "scanning": 2,
    "failed": 0
  }
}
```

### 2. Scan Strategy

- **Don't scan if** `available > 100` - you have enough JobIds
- **Scan only when** `available < 50` - running low
- **Use manual add** when rate limited and `available < 20` - critical

### 3. Manual JobId Sources

Where to find JobIds manually:
1. **Roblox Website**: Visit game page, inspect server list in DevTools
2. **Game Servers**: Click "Servers" tab, copy JobIds from URL
3. **Friends**: Join friend's server, check `game.JobId` in F9 console

### 4. Lua Script Auto-Handling

The Lua scanner script already handles rate limits:
- When `/next/threadId` returns `NONE`, it waits and retries
- No changes needed to the script

## Monitoring Rate Limits

### Check Current Status

**API**:
```
GET /status
```

**Response**:
```json
{
  "scanner": {
    "available": 45,
    "scanning": 4,
    "failed": 0,
    "used": 2341
  }
}
```

### Scan Result Messages

**Success**:
```
✅ [JobId Scanner] Hoàn thành!
📊 Tổng JobId mới: 234
📊 JobId có sẵn: 279
```

**Rate Limited**:
```
❌ [JobId Scanner] Lỗi: Request failed with status code 429
⚠️ Rate Limit: Bị Roblox chặn. Đợi 20 phút trước khi quét lại.
⏰ Có thể quét lại sau: 14:35:00
```

## Troubleshooting

### Problem: Still Rate Limited After 20 Minutes

**Solution**: The 20-minute timer is conservative. If Roblox is still blocking:
1. Wait another 10 minutes
2. Use `/jobid` to manually add instead
3. Contact admin to check API configuration

### Problem: Manual JobIds All Skipped

**Check**:
```
/status endpoint → "used": 2341
```

If JobId is in the "used" set, it was already scanned. Find fresh JobIds from:
- Recent server list (newer servers)
- Different game regions/times
- Friend servers

### Problem: Too Many Manual Additions

If you're adding JobIds manually too often:
1. **Increase scan frequency** - but risk more rate limits
2. **Run more tabs** - distribute load across threads
3. **Check scanner efficiency** - are threads completing properly?

## Rate Limit Prevention

### Tips to Avoid Rate Limits

1. **Don't spam `/scan`** - wait at least 5 minutes between scans
2. **Monitor available count** - only scan when needed
3. **Use 4-tab setup** - efficient thread distribution prevents wasting JobIds
4. **Let auto-scan work** - system auto-scans when JobIds run out

### Optimal Scanning Schedule

| Available JobIds | Action | Reason |
|------------------|--------|--------|
| > 150 | Wait | Plenty in queue |
| 50-150 | Optional scan | Comfortable buffer |
| 20-50 | Scan recommended | Running low |
| < 20 | **Manual add or wait** | Critical - don't waste scan on rate limit |

## Summary

✅ **Rate limit is 20 minutes** - system handles automatically
✅ **Use `/jobid` command** - manual workaround during rate limit
✅ **Check `/status`** - monitor JobId availability
✅ **Scan strategically** - only when `available < 50`
✅ **Let system work** - auto-scan when needed, don't force it

The system is designed to be resilient. Rate limits are temporary inconveniences, not system failures.
