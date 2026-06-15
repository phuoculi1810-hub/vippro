# 📚 API & COMMANDS COMPLETE REFERENCE

## 🔄 **TOKEN RESET THÔNG BÁO**

Khi reset Discord bot token:
- ✅ **KHÔNG mất quyền** - Bot permissions giữ nguyên
- ✅ **Invite link cũ** vẫn hoạt động
- 🔄 **Chỉ cần** cập nhật token mới trong Railway Variables
- ⚡ **Railway tự động restart** sau khi update variables

## 🌐 API Endpoints (Brain Central)

### Base URL
```
Production: https://asura-scanner-system-v2-production.up.railway.app
Local: http://localhost:3000
```

### 🔄 JobId Management

#### 1. Quét JobId mới
```http
POST /scan-jobids
Content-Type: application/json

Response:
{
  "message": "JobId scanning started"
}
```

#### 2. Lấy JobId tiếp theo (Thread-safe)
```http
GET /next/{threadId}

Example: GET /next/thread_1234

Response: 
"6d40e709-963a-4113-a038-b6cb29a23c8b"
or "NONE" (hết JobId)
```

#### 3. Đánh dấu JobId hoàn thành
```http
POST /complete
Content-Type: application/json

Body:
{
  "jobId": "6d40e709-963a-4113-a038-b6cb29a23c8b",
  "result": "completed" // hoặc "failed", "interesting_server", "normal_server"
}
```

#### 4. Báo server full
```http
POST /report-full
Content-Type: application/json

Body:
{
  "jobId": "6d40e709-963a-4113-a038-b6cb29a23c8b"
}
```

### 📊 Monitoring & Status

#### 5. Xem trạng thái hệ thống
```http
GET /status

Response:
{
  "scanner": {
    "available": 450,      // JobId có sẵn
    "scanning": 3,         // Đang scan
    "failed": 0,           // Failed cần retry
    "used": 12459,         // Đã sử dụng
    "scanningList": [      // Chi tiết đang scan
      {
        "jobId": "abc123...",
        "threadId": "thread_1",
        "assignedAt": 1703123456789
      }
    ]
  },
  "database": {
    "servers": 1247,       // Server đã scan
    "players": 15649,      // Player tìm thấy
    "gangs": 2847          // Gang tìm thấy
  }
}
```

### 📡 Data Reporting (từ Script)

#### 6. Báo cáo server age
```http
POST /report
Content-Type: application/json

Body:
{
  "jobId": "6d40e709-963a-4113-a038-b6cb29a23c8b",
  "ageMinutes": 125      // Tuổi server tính bằng phút
}
```

#### 7. Báo cáo tìm thấy player/gang
```http
POST /report-find
Content-Type: application/json

Body:
{
  "type": "player",      // hoặc "gang"
  "name": "manchanhkundz",
  "jobId": "6d40e709-963a-4113-a038-b6cb29a23c8b"
}
```

#### 9. Clear database (NEW!)
```http
POST /clear-data
Content-Type: application/json

Body:
{
  "type": "all",        // "all", "players", "gangs", "servers", "old"
  "confirm": true       // Bắt buộc phải true
}

Response:
{
  "success": true,
  "type": "all",
  "before": { "servers": 1247, "players": 15649, "gangs": 2847 },
  "after": { "servers": 0, "players": 0, "gangs": 0 },
  "cleared": { "servers": 1247, "players": 15649, "gangs": 2847 }
}
```

### 🎮 Game Integration (Legacy)

#### 10. Lấy JobId (legacy, không thread-safe)
```http
GET /next

Response: JobId string hoặc "NONE"
```

#### 11. Join command
```http
GET /join

Response: Pending JobId để join hoặc "NONE"
```

---

## 🤖 Discord Bot Commands

### 👑 Admin Commands (Chỉ ADMIN_USER_IDS)

#### 1. Tạo Key mới
```discord
/createkey type:usage value:50 maxusers:3 usagelimit:10

Parameters:
- type: "usage" (theo lượt) hoặc "time" (theo giờ)
- value: Số lượt (usage) hoặc số giờ (time) 
- maxusers: Số người tối đa có thể dùng key (optional)
- usagelimit: Giới hạn lượt mỗi Discord user (optional, 0 = không giới hạn)

Examples:
/createkey type:usage value:100 maxusers:5 usagelimit:20
→ Key 100 lượt, 5 người, mỗi người tối đa 20 lần

/createkey type:time value:24 maxusers:1
→ Key 24 giờ, 1 người dùng
```

#### 2. Xem logs sử dụng
```discord
/logs command:username limit:30

Parameters:
- command: "username", "gang", "boss", "rift" (optional)
- limit: Số logs tối đa, default 30 (optional)

Examples:
/logs command:username limit:50
→ Xem 50 logs lệnh username gần đây

/logs limit:100  
→ Xem 100 logs tất cả lệnh
```

#### 3. Xem thống kê bot
```discord
/stats

Response: Embed hiển thị:
- Total logs
- Logs 24h gần đây
- Logs 1h gần đây  
- Thống kê theo từng lệnh (success/failed)
```

#### 4. Clear database (NEW!)
```discord
/cleardata type:all confirm:true

Parameters:
- type: "all", "players", "gangs", "servers", "old" (required)
- confirm: true (required - KHÔNG THỂ HOÀN TÁC)

Examples:
/cleardata type:all confirm:true
→ Xóa toàn bộ database

/cleardata type:old confirm:true  
→ Xóa servers ≥38h old (+ players/gangs của chúng)

/cleardata type:players confirm:true
→ Chỉ xóa players database

Response: Embed hiển thị số lượng data đã xóa
```

### 👤 User Commands (Cần key hợp lệ)

#### 5. Tìm player
```discord
/username player:manchanhkundz key:key_abc123def456

Response nếu tìm thấy:
👤 Player Tìm Thấy
- Tên Player: manchanhkundz
- Thời gian tìm thấy: 5 phút trước
- Join Link: [Click để join](https://www.fishstrap.app/v1/joingame?placeId=13358463560&gameInstanceId=JOBID)

Response nếu không tìm thấy:
❌ Không tìm thấy username `manchanhkundz`
```

#### 6. Tìm gang
```discord
/gang name:oka key:key_abc123def456

Response nếu tìm thấy:
🏴 Gang Tìm Thấy
- Okami: [Join Server](link) - 3 phút trước
- Aokama: [Join Server](link) - 12 phút trước

Response nếu không tìm thấy:
❌ Không tìm thấy gang hoặc sai tên gang `oka`
```

#### 7. Tìm Boss servers
```discord
/boss key:key_abc123def456

Response:
🔥 Boss Servers
- Server (Age: 2h55m): [Join Server](link)
  còn 5 phút sẽ xuất hiện Boss
- Server (Age: 4h52m): [Join Server](link) 
  đã xuất hiện Boss 3 phút trước
```

#### 7. Tìm Rift servers
```discord
/rift key:key_abc123def456

Response:
🌀 Rift Servers
- Server (Age: 3h08m): [Join Server](link)
  còn 2 phút sẽ xuất hiện Rift
- Server (Age: 4h32m): [Join Server](link)
  đã xuất hiện Rift 8 phút trước
```

#### 8. Xem key usage
```discord
/keyusage key:key_abc123def456

Response:
📊 Key Usage
- Key ID: `key_abc123def456`
- Bạn đã sử dụng: 15 lần
- Giới hạn của bạn: 20 lần
- Còn lại: 5 lần
- Tổng đã sử dụng: 145/200 lần
```

---

## 🖥️ Console Commands (Brain Central)

Gõ trực tiếp trong terminal chạy `rift.js`:

### 📊 Database Commands

```bash
/player          # Hiển thị danh sách players
/gang            # Hiển thị danh sách gangs  
/list            # Hiển thị danh sách servers
/clear [type]    # Clear database với options
                 # /clear confirm - Xóa toàn bộ
                 # /clear old - Xóa data >7 ngày
                 # /clear players - Chỉ xóa players
                 # /clear gangs - Chỉ xóa gangs  
                 # /clear servers - Chỉ xóa servers
```

### 🔍 Search Commands

```bash
/rift            # Tìm server có Rift sắp spawn
/boss            # Tìm server có Boss sắp spawn
```

### 🎮 Join Commands

```bash
/joinplayer      # Chọn player để join server
/joingang        # Chọn gang để join server
```

### ⚙️ System Commands  

```bash
/scan            # Quét JobId mới ngay lập tức
/status          # Hiển thị trạng thái hệ thống
/reload          # Reload dữ liệu JobId Scanner
```

---

## 🎮 Script Lua Controls

### ⌨️ Phím tắt trong game

```lua
F1               # Hiển thị thông tin server hiện tại
F2               # Hop server ngay lập tức  
F3               # Dừng/Tiếp tục auto hop
```

### 🔧 Config trong script

```lua
local CONFIG = {
    THREAD_ID = "thread_" .. math.random(1000, 9999),
    BRAIN_URL = "https://your-app.railway.app",  -- Railway URL
    AUTO_HOP = true,                             -- Tự động hop
    WAIT_TIME_PER_SERVER = 8,                   -- Thời gian quét (giây)
    FISHSTRAP_URL = "https://www.fishstrap.app/v1/joingame?placeId=13358463560&gameInstanceId=",
}
```

---

## 📝 Usage Examples

### 🔄 Script workflow (4 tabs)

**Tab 1:**
```lua
CONFIG.THREAD_ID = "thread_1"
CONFIG.AUTO_HOP = true
-- Execute script → Tự động quét và hop
```

**Tab 2:**
```lua  
CONFIG.THREAD_ID = "thread_2"
CONFIG.AUTO_HOP = true
-- Execute script → Quét parallel với tab 1
```

**Tab 3:**
```lua
CONFIG.THREAD_ID = "thread_3" 
CONFIG.AUTO_HOP = false
-- Execute script → Chỉ scan server hiện tại
```

**Tab 4:**
```lua
CONFIG.THREAD_ID = "thread_4"
-- Manual control với F2/F3
```

### 🔑 Key management workflow

1. **Admin tạo key:**
```discord
/createkey type:usage value:100 maxusers:10 usagelimit:10
```

2. **User nhận key và sử dụng:**
```discord
/username player:target_player key:key_abc123def456
/keyusage key:key_abc123def456
```

3. **Admin monitor usage:**
```discord
/logs command:username limit:50
/stats
```

### 🌐 API integration workflow

1. **Quét JobId:**
```bash
curl -X POST https://your-app.railway.app/scan-jobids
```

2. **Script lấy JobId:**
```bash
curl https://your-app.railway.app/next/thread_1
```

3. **Script báo cáo kết quả:**
```bash
curl -X POST https://your-app.railway.app/complete \
  -H "Content-Type: application/json" \
  -d '{"jobId":"abc123", "result":"completed"}'
```

---

**📱 Tất cả commands đều hoạt động trên cả Desktop và Mobile Discord!**

## 🕐 Auto Cleanup Features (NEW!)

Hệ thống tự động dọn dẹp data cũ:

- **⏰ Auto cleanup mỗi 24h**: Tự động xóa data >7 ngày
- **🔧 Stuck scanning cleanup**: Mỗi 5 phút cleanup JobId bị stuck  
- **📊 Smart retention**: Giữ lại data quan trọng, xóa data không cần thiết

### Clear Data Examples:

```bash
# API - Clear all data
curl -X POST https://your-app.railway.app/clear-data \
  -H "Content-Type: application/json" \
  -d '{"type":"all", "confirm":true}'

# API - Clear old data only  
curl -X POST https://your-app.railway.app/clear-data \
  -H "Content-Type: application/json" \
  -d '{"type":"old", "confirm":true}'

# Console - Clear commands
/clear confirm        # Clear all
/clear old           # Clear >7 days
/clear players       # Clear players only
/clear gangs         # Clear gangs only
/clear servers       # Clear servers only

# Discord - Admin clear commands
/cleardata type:all confirm:true
/cleardata type:old confirm:true
/cleardata type:players confirm:true
```

---

**📱 Tất cả commands đều hoạt động trên cả Desktop và Mobile Discord!**