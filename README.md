# ASURA GAME SCANNER V2 🚀

Hệ thống quét và quản lý server game Asura hoàn toàn mới với API thread-safe, Discord Bot và Key System.

## 🌟 Tính năng mới

### 1. **API JobId Thread-Safe**
- ✅ Tự động quét JobId mới khi hết
- ✅ Chia JobId theo thread tránh trùng lặp
- ✅ Xử lý server full thông minh
- ✅ Cleanup tự động cho stuck scanning

### 2. **Script Lua V2**
- ✅ Quét **TẤT CẢ** players và gangs trong server
- ✅ Logic gettime chính xác từ ServerTimeReader.lua
- ✅ Thread ID unique tránh xung đột
- ✅ Phím tắt điều khiển (F1/F2/F3)

### 3. **Discord Bot với Key System**
- ✅ Key theo lượt sử dụng hoặc thời gian
- ✅ Giới hạn số người dùng đồng thời
- ✅ Lệnh admin quản lý key
- ✅ Tìm kiếm players/gangs/boss/rift
- ✅ Link Fishstrap tự động

## 📁 Cấu trúc Project

```
system_new/
├── api/
│   └── jobid-scanner.js        # API quét JobId thread-safe
├── data/                       # Database files (auto-generated)
│   ├── jobids_queue.json       # Queue JobId
│   └── used_jobids.json        # JobId đã sử dụng
├── discord-bot/
│   ├── bot.js                  # Discord bot chính
│   ├── package.json            # Dependencies bot
│   ├── keys.json               # Key database (auto-generated)
│   └── usage.json              # Usage tracking (auto-generated)
├── scripts/
│   └── asura_scanner_v2.lua    # Script Lua mới
├── config/
│   └── config.json             # Cấu hình hệ thống
├── rift.js                     # Brain Central V2
├── rift_database.json          # Database chính (auto-generated)
├── package.json                # Dependencies chính
└── README.md                   # Hướng dẫn này
```

## 🚀 Cài đặt

### 1. Cài đặt dependencies
```bash
# Cài đặt tất cả dependencies
npm run install-all

# Hoặc cài thủ công
npm install
cd discord-bot && npm install && cd ..
```

### 2. Cấu hình Discord Bot
1. Tạo bot tại [Discord Developer Portal](https://discord.com/developers/applications)
2. Sửa `discord-bot/bot.js`:
   ```javascript
   const CONFIG = {
       TOKEN: 'YOUR_BOT_TOKEN_HERE', // Thay bằng bot token
       ADMIN_USER_IDS: ['123456789012345678'], // Thay bằng Discord ID của bạn
   };
   ```
3. Invite bot vào server với quyền `applications.commands`

## 🎮 Sử dụng

### 1. Khởi động Brain Central
```bash
npm start
# hoặc
node rift.js
```

### 2. Khởi động Discord Bot
```bash
npm run bot
# hoặc
cd discord-bot && npm start
```

### 3. Sử dụng Script Lua
1. Copy nội dung `scripts/asura_scanner_v2.lua`
2. Execute trong game Roblox
3. Phím tắt:
   - **F1**: Xem info server
   - **F2**: Hop ngay lập tức
   - **F3**: Dừng/Tiếp tục auto hop

## 🔑 Discord Bot Commands

### User Commands (cần key)
- `/username <player> <key>` - Tìm player
- `/gang <name> <key>` - Tìm gang
- `/boss <key>` - Tìm server có boss
- `/rift <key>` - Tìm server có rift

### Admin Commands
- `/createkey <type> <value> [maxusers]` - Tạo key mới
- `/keyinfo <keyid>` - Xem thông tin key

### Ví dụ tạo key:
```
/createkey type:usage value:50 maxusers:3
→ Tạo key 50 lượt, tối đa 3 người dùng

/createkey type:time value:24 maxusers:1  
→ Tạo key 24 giờ, 1 người dùng
```

## 🛠 API Endpoints

### Brain Central API
- `POST /scan-jobids` - Quét JobId mới
- `GET /status` - Xem trạng thái hệ thống
- `GET /next/threadId` - Lấy JobId theo thread
- `POST /complete` - Đánh dấu hoàn thành
- `POST /report-full` - Báo server full

### Ví dụ sử dụng API:
```bash
# Quét JobId mới
curl -X POST http://localhost:3000/scan-jobids

# Xem status
curl http://localhost:3000/status

# Lấy JobId cho thread
curl http://localhost:3000/next/thread1
```

## 📊 Console Commands

```
/scan          - Quét JobId mới ngay
/status        - Xem trạng thái hệ thống
/rift          - Tìm server Rift
/boss          - Tìm server Boss
/player        - Xem danh sách players
/gang          - Xem danh sách gangs
/joinplayer    - Join server có player
/joingang      - Join server có gang
/list          - Xem database servers
/clear         - Xóa database
/reload        - Reload dữ liệu
```

## 🔄 Workflow Mới

1. **Auto Scan**: Hệ thống tự động quét JobId mới khi hết
2. **Thread Safe**: Nhiều script có thể chạy song song không bị trùng JobId
3. **Smart Detection**: Script quét TẤT CẢ players/gangs, không chỉ target list
4. **Full Server Handling**: Server full được xóa ngay, không retry
5. **Discord Integration**: Users dùng bot Discord với key system

## 🎯 Tính năng nổi bật

### JobId Management
- Queue thông minh với 3 trạng thái: Available → Scanning → Completed/Failed
- Cleanup tự động cho stuck scanning (>10 phút)
- Thread ID unique tránh conflict
- Auto retry failed JobIds

### Script Intelligence  
- Quét toàn bộ players (không chỉ target list)
- Quét toàn bộ gangs chiếm gym
- Logic Boss/Rift detection chính xác
- Dừng tại server "interesting" (nhiều player, gang, boss/rift)

### Discord Bot Features
- Key system linh hoạt (usage-based hoặc time-based)
- Concurrent user limit
- Admin management commands
- Fishstrap integration
- Ephemeral responses (chỉ user thấy)

## 🔧 Troubleshooting

### Script không lấy được JobId
```lua
-- Kiểm tra kết nối Brain Central
print("Testing connection...")
local response = brainRequest("/status", "GET")
if response then
    print("✅ Connected")
else
    print("❌ Connection failed")
end
```

### Discord Bot không hoạt động
1. Kiểm tra bot token đúng chưa
2. Bot có quyền `applications.commands` chưa
3. Brain Central có chạy không (port 3000)

### Database corrupt
```bash
# Backup và reset
cp rift_database.json rift_database_backup.json
echo '{"servers":{}, "players":{}, "gangs":{}}' > rift_database.json
```

## 📈 Performance Tips

1. **Multiple Threads**: Chạy nhiều script với thread ID khác nhau
2. **Scheduled Scanning**: Dùng cron job quét JobId định kỳ
3. **Database Cleanup**: Định kỳ xóa data cũ >7 ngày
4. **Key Management**: Monitor usage và tạo key mới khi cần

## 🆚 So sánh với hệ thống cũ

| Tính năng | Hệ thống cũ | Hệ thống mới V2 |
|-----------|-------------|-----------------|
| JobId Management | File text đơn giản | Queue API thread-safe |
| Player Detection | Target list cố định | Quét toàn bộ server |
| Gang Detection | Target list cố định | Quét toàn bộ gang chiếm gym |
| Multi-threading | Không hỗ trợ | Thread ID unique |
| Discord Bot | Không có | Full key system |
| Server Age | Logic cơ bản | ServerTimeReader.lua |
| Auto Retry | Cơ bản | Smart retry + cleanup |
| Database | JSON đơn giản | Structured với metadata |

## 🤝 Contributing

1. Fork project
2. Tạo feature branch
3. Commit changes
4. Push và tạo Pull Request

## 📝 Changelog

### V2.0.0
- ✅ Thread-safe API JobId management
- ✅ Comprehensive player/gang scanning
- ✅ Discord bot with key system  
- ✅ Smart server age detection
- ✅ Auto retry and cleanup mechanisms
- ✅ Fishstrap integration
- ✅ Performance optimizations

---

**Made with ❤️ for Asura Community**