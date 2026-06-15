# 🚀 RAILWAY DEPLOYMENT GUIDE - UPDATED

Hướng dẫn deploy Asura Scanner System V2 lên Railway.app (free hosting) với bảo mật hoàn hảo.

## ✅ Bước 1: Chuẩn bị Discord Bot

### 1.1 Tạo Discord Bot
1. Vào [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** → Đặt tên (vd: "Asura Scanner Bot")
3. Vào tab **"Bot"** → Click **"Add Bot"**
4. **RESET TOKEN** (nếu đã tạo trước đó) → Copy token mới
5. Lưu lại **Bot Token** (dạng: `MTxxx.xxx.xxx`)

### 1.2 Lấy Discord User ID (Admin)
1. Bật Developer Mode trong Discord: Settings → Advanced → Developer Mode ✅
2. Right-click vào tên bạn → **Copy User ID**
3. Lưu lại số này (dạng: `123456789012345678`)

### 1.3 Invite Bot vào Server
1. Trong Developer Portal → tab **"OAuth2"** → **"URL Generator"**
2. Chọn scopes: ☑️ `bot`, ☑️ `applications.commands`
3. Bot permissions: ☑️ `Send Messages`, ☑️ `Use Slash Commands`
4. Copy link và mở để invite bot

## ✅ Bước 2: Deploy lên Railway

### 2.1 Tạo tài khoản Railway
1. Vào [Railway.app](https://railway.app)
2. Sign up bằng **GitHub account**
3. Verify email nếu cần

### 2.2 Tạo Project mới
1. Click **"New Project"**
2. Chọn **"Deploy from GitHub repo"**
3. Connect GitHub account nếu chưa
4. Chọn repository chứa code `system_new/`
5. Railway sẽ tự động detect và build

### 2.3 Cấu hình Environment Variables ⭐ QUAN TRỌNG
Trong Railway Dashboard → **Settings** → **Variables**, thêm chính xác:

```env
DISCORD_TOKEN=MTxxx.xxx.xxx
ADMIN_USER_IDS=123456789012345678
NODE_ENV=production
PORT=8080
```

**⚠️ LƯU Ý:**
- `DISCORD_TOKEN`: Token từ Discord Developer Portal (không có prefix "Bot ")
- `ADMIN_USER_IDS`: Discord User ID của bạn (Copy User ID)
- Không có dấu cách thừa
- Không có dấu ngoặc kép

### 2.4 Deploy và lấy URL
1. Railway sẽ tự động build và deploy
2. Đợi 2-3 phút để deploy hoàn tất
3. Vào **"Deployments"** tab → Click vào deployment mới nhất
4. Copy **Domain URL** (dạng: `https://xxx-production-xxx.up.railway.app`)

## ✅ Bước 3: Cập nhật Script Lua

Sửa file `scripts/asura_scanner_v2.lua`, dòng BRAIN_URL:

```lua
local CONFIG = {
    THREAD_ID = "thread_" .. math.random(1000, 9999),
    BRAIN_URL = "https://YOUR-RAILWAY-URL-HERE.up.railway.app", -- ⭐ Thay URL này
    AUTO_HOP = true,
    WAIT_TIME_PER_SERVER = 8,
    FISHSTRAP_URL = "https://www.fishstrap.app/v1/joingame?placeId=13358463560&gameInstanceId=",
}
```

**Ví dụ:**
```lua
BRAIN_URL = "https://asura-scanner-system-v2-production.up.railway.app",
```

## ✅ Bước 4: Test hoạt động

### 4.1 Kiểm tra API ✅
**Test 1:** Mở browser: `https://your-app.railway.app`
```
Response: "Rift Brain Central is Running..."
```

**Test 2:** API Status: `https://your-app.railway.app/status`
```json
{
  "scanner": {
    "available": 0,
    "scanning": 0,
    "failed": 0,
    "used": 0
  },
  "database": {
    "servers": 0,
    "players": 0,
    "gangs": 0
  }
}
```

### 4.2 Kiểm tra Discord Bot ✅
1. Vào Discord server đã invite bot
2. Gõ `/` → Kiểm tra có commands:
   - ✅ `/createkey` (admin only)
   - ✅ `/username` 
   - ✅ `/gang`
   - ✅ `/boss`
   - ✅ `/rift`
   - ✅ `/cleardata` (admin only)

### 4.3 Tạo key test ✅
```discord
/createkey type:usage value:10 maxusers:1 usagelimit:5
```
**Response expected:** Embed với key mới được tạo

### 4.4 Test Script Lua ✅
1. Execute script trong Roblox game
2. Kiểm tra console có log:
   ```
   🚀 ASURA SCANNER V2: SCRIPT ĐANG KHỞI CHẠY...
   👤 Người chơi: YourUsername  
   🔗 Thread ID: thread_1234
   📞 Đang lấy JobId tiếp theo từ API...
   ```
3. Nếu thành công sẽ thấy: `📞 Lấy được JobId mới: abc12345...`

## 🔧 Troubleshooting

### ❌ **Bot không online**
**Lỗi trong Railway logs:** `DiscordjsError [TokenInvalid]: An invalid token was provided`

**✅ Giải pháp:**
1. Kiểm tra `DISCORD_TOKEN` trong Railway Variables
2. Token phải có dạng `MTxxx.xxx.xxx` (KHÔNG cần "Bot " prefix)
3. Reset token trong Discord Developer Portal nếu cần
4. **Redeploy** sau khi thay đổi variables

### ❌ **Script không lấy được JobId**
**Lỗi:** Console hiện `⚠️ Không lấy được JobId mới từ API!`

**✅ Giải pháp:**
1. Kiểm tra `BRAIN_URL` trong script có đúng Railway URL không
2. Test API: Mở `https://your-app.railway.app/status` trong browser
3. Quét JobId mới: POST request tới `/scan-jobids`

### ❌ **Commands không hiển thị**
**Lỗi:** Gõ `/` không thấy bot commands

**✅ Giải pháp:**
1. Kiểm tra bot có quyền `applications.commands`
2. Re-invite bot với đủ quyền
3. Đợi 5-10 phút để Discord sync commands

### ❌ **"Application did not respond"**
**Lỗi:** Commands bị timeout

**✅ Giải pháp:**
1. Kiểm tra `ADMIN_USER_IDS` có đúng Discord User ID
2. Thử command với user khác (không phải admin commands)
3. Check Railway logs có errors không

### ❌ **Railway build failed**
**Lỗi:** Build process failed

**✅ Giải pháp:**
1. Đảm bảo `package.json` có `start` script
2. Check có file `railway.toml` không
3. Verify không có syntax errors trong code

## 📊 Commands đầy đủ sau deploy

### 🔑 Admin Commands (ADMIN_USER_IDS)
```discord
/createkey type:usage value:50 maxusers:3 usagelimit:10
# Tạo key 50 lượt, 3 người dùng, mỗi người tối đa 10 lần

/createkey type:time value:24 maxusers:1  
# Tạo key 24 giờ, 1 người dùng

/cleardata type:all confirm:true
# Clear toàn bộ database

/cleardata type:old confirm:true
# Clear servers ≥38h old

/logs command:username limit:20
# Xem logs usage

/stats
# Thống kê bot
```

### 👤 User Commands (Cần key)
```discord
/username player:manchanhkundz key:key_abc123def456
/gang name:oka key:key_abc123def456
/boss key:key_abc123def456
/rift key:key_abc123def456
/keyusage key:key_abc123def456
```

### 🖥️ Console Commands (Railway logs)
```bash
/scan          # Quét JobId mới
/status        # System status
/ages          # Server ages monitor
/clear old     # Clear servers ≥38h
/player        # Players list
/gang          # Gangs list
```

## 🌐 API Endpoints hoạt động

```bash
# System status
curl https://your-app.railway.app/status

# Scan new JobIds  
curl -X POST https://your-app.railway.app/scan-jobids

# Get JobId (thread-safe)
curl https://your-app.railway.app/next/thread_1234

# Complete JobId
curl -X POST https://your-app.railway.app/complete \
  -H "Content-Type: application/json" \
  -d '{"jobId":"abc123", "result":"completed"}'
```

## ✨ Pro Tips

### 🔄 Multiple Scripts
Chạy nhiều script song song:
```lua
-- Tab 1
CONFIG.THREAD_ID = "thread_1"

-- Tab 2  
CONFIG.THREAD_ID = "thread_2"

-- Tab 3
CONFIG.THREAD_ID = "thread_3"
```

### 📱 Mobile Support
- Discord commands hoạt động trên mobile
- API endpoints có thể test qua mobile browser
- Railway dashboard responsive trên điện thoại

### 🔑 Key Management Best Practices
- **Usage keys** cho bot public (giới hạn lần sử dụng)
- **Time keys** cho VIP users (giới hạn thời gian)
- **Per-user limits** để tránh abuse
- Monitor usage qua `/logs` và `/stats`

---

**🎮 Happy Gaming với hệ thống hoàn toàn tự động!** 🚀 