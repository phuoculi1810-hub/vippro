# 🚀 Hướng dẫn Deploy miễn phí

## Phương án 1: Railway.app (KHUYÊN DÙNG) 🌟

### Ưu điểm:
- ✅ $5 credit miễn phí/tháng (đủ chạy 24/7)
- ✅ Deploy tự động từ GitHub
- ✅ Hỗ trợ Node.js native
- ✅ Database PostgreSQL miễn phí
- ✅ Custom domain miễn phí
- ✅ HTTPS tự động

### Các bước:

#### 1. Chuẩn bị GitHub Repository
```bash
cd system_new
git init
git add .
git commit -m "Initial commit"

# Tạo repo mới trên GitHub, sau đó:
git remote add origin https://github.com/USERNAME/asura-scanner.git
git push -u origin main
```

#### 2. Deploy trên Railway
1. Truy cập: https://railway.app
2. Đăng nhập bằng GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Chọn repository vừa tạo
5. Railway sẽ tự động detect Node.js và deploy

#### 3. Cấu hình Environment Variables
Trong Railway dashboard:
- `DISCORD_TOKEN`: Token bot Discord
- `ADMIN_USER_IDS`: Discord ID của admin (cách nhau bởi dấu phẩy)
- `NODE_ENV`: production

#### 4. Cấu hình Discord Bot Token
```javascript
// Sửa discord-bot/bot.js
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    ADMIN_USER_IDS: (process.env.ADMIN_USER_IDS || '123456789012345678').split(','),
};
```

---

## Phương án 2: Render.com 

### Ưu điểm:
- ✅ Miễn phí vĩnh viễn (có giới hạn)
- ✅ Auto-sleep sau 15 phút không hoạt động
- ✅ 750h miễn phí/tháng

### Cách deploy:
1. Truy cập: https://render.com
2. Kết nối GitHub repository
3. Chọn "Web Service"
4. Build Command: `npm install`
5. Start Command: `npm start`

### ⚠️ Lưu ý:
- Service sẽ sleep sau 15 phút không hoạt động
- Cần setup ping service để giữ alive

---

## Phương án 3: Heroku (Có phí)

### Chi phí: $5-7/tháng
1. Tạo app trên Heroku
2. Connect GitHub repository  
3. Enable automatic deployments
4. Thêm environment variables

---

## Phương án 4: Hosting VPS miễn phí

### Oracle Cloud (12 tháng miễn phí)
1. Đăng ký tài khoản Oracle Cloud
2. Tạo VM instance miễn phí (Always Free Tier)
3. Setup Ubuntu server
4. Cài đặt Node.js và PM2
5. Clone repository và chạy

### Google Cloud Platform ($300 credit)
1. Đăng ký GCP với $300 credit
2. Tạo Compute Engine instance
3. Setup tương tự Oracle

---

## 🔧 Setup cho Production

### 1. Environment Variables cần thiết:
```bash
DISCORD_TOKEN=your_discord_bot_token
ADMIN_USER_IDS=123456789012345678,987654321098765432
NODE_ENV=production
PORT=3000
```

### 2. Database persistence:
- Railway: Sử dụng PostgreSQL addon
- Render: Sử dụng external database
- Heroku: Heroku Postgres addon

### 3. Process management:
```bash
# Cài PM2 cho VPS
npm install -g pm2
pm2 start combined-server.js --name "asura-scanner"
pm2 startup
pm2 save
```

---

## 🎯 Khuyến nghị

### Cho beginner: **Railway.app**
- Setup đơn giản nhất
- $5/tháng đủ chạy 24/7
- Tự động deploy từ GitHub

### Cho advanced: **Oracle Cloud VPS**
- Hoàn toàn miễn phí (12 tháng)
- Full control server
- Có thể chạy nhiều service

### Cho testing: **Render.com**
- Hoàn toàn miễn phí
- Tốt cho test và demo
- Có giới hạn uptime

---

## 📱 Giữ service alive

### UptimeRobot (miễn phí)
1. Đăng ký: https://uptimerobot.com
2. Thêm monitor HTTP cho API endpoint
3. Ping every 5 minutes để tránh sleep

### Ping service script:
```javascript
// keep-alive.js
setInterval(() => {
    fetch('https://your-app.railway.app/status')
        .then(() => console.log('Ping successful'))
        .catch(err => console.log('Ping failed:', err));
}, 5 * 60 * 1000); // Ping every 5 minutes
```

---

## 🔍 Monitoring

### Railway Dashboard
- Xem logs realtime
- Monitor resource usage
- Database metrics

### Discord Webhook logs
```javascript
// Thêm vào bot.js để nhận logs qua Discord
function sendLog(message) {
    const webhookUrl = process.env.LOG_WEBHOOK;
    if (webhookUrl) {
        // Send log to Discord webhook
    }
}
```

---

**Khuyến nghị: Bắt đầu với Railway.app, sau đó chuyển sang VPS nếu cần nhiều tài nguyên hơn.**