const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const JobIdScanner = require('./api/jobid-scanner');

const PORT = process.env.PORT || 3000;
const DB_FILE = 'rift_database.json';

// Initialize JobId Scanner
const jobIdScanner = new JobIdScanner();

// Initialize database
let db = { servers: {}, players: {}, gangs: {} };
if (fs.existsSync(DB_FILE)) {
    try {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (raw.servers) {
            db = raw;
        } else {
            db.servers = raw;
        }
    } catch (e) {
        db = { servers: {}, players: {}, gangs: {} };
    }
}

let pendingJoinJobId = null;
let awaitingSelection = null;

// Auto cleanup stuck scanning every 5 minutes
setInterval(() => {
    jobIdScanner.cleanupStuckScanning();
}, 5 * 60 * 1000);

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function timeAgo(timestamp) {
    const secs = Math.floor(Date.now() / 1000) - timestamp;
    if (secs < 60) return 'vua xong';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} phut truoc`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours} gio ${remainMins} phut truoc`;
}

function calculateCurrentAge(jobId) {
    const data = db.servers[jobId];
    if (!data) return 0;
    const now = Math.floor(Date.now() / 1000);
    return data.ageAtScan + Math.floor((now - data.timestamp) / 60);
}

function showPlayerList() {
    const entries = Object.entries(db.players);
    if (entries.length === 0) {
        console.log('\n❌ Chua tim thay player nao.');
        return;
    }
    console.log(`\n--- PLAYER DATABASE (${entries.length}) ---`);
    entries.forEach(([name, data]) => {
        console.log(`- ${name} | ${data.jobId} | ${timeAgo(data.timestamp)}`);
    });
}

function showGangList() {
    const entries = Object.entries(db.gangs);
    if (entries.length === 0) {
        console.log('\n❌ Chua tim thay gang nao.');
        return;
    }
    console.log(`\n--- GANG DATABASE (${entries.length}) ---`);
    entries.forEach(([name, data]) => {
        console.log(`- ${name} | ${data.jobId} | ${timeAgo(data.timestamp)}`);
    });
}

function showJoinList(type) {
    const source = type === 'player' ? db.players : db.gangs;
    const entries = Object.entries(source);
    if (entries.length === 0) {
        console.log(`\n❌ Chua co du lieu ${type} de join.`);
        return;
    }
    console.log(`\n--- CHON ${type.toUpperCase()} DE JOIN ---`);
    entries.forEach(([name, data], i) => {
        console.log(`${i + 1}: ${name} | ${data.jobId} | da tim thay ${timeAgo(data.timestamp)}`);
    });
    console.log('Nhap so de join (Enter de huy):');
    awaitingSelection = { type, entries };
}

function handleSelection(input) {
    if (!awaitingSelection) return false;
    const num = parseInt(input.trim(), 10);
    if (isNaN(num) || num < 1 || num > awaitingSelection.entries.length) {
        console.log('❌ Lua chon khong hop le.');
        awaitingSelection = null;
        return true;
    }
    const [name, data] = awaitingSelection.entries[num - 1];
    pendingJoinJobId = data.jobId;
    console.log(`\n✅ Da chon: ${name}`);
    console.log(`📍 JobId: ${data.jobId}`);
    console.log(`🎮 Game se tu dong hop den server nay...`);
    console.log(`   Join: game:GetService('TeleportService'):TeleportToPlaceInstance(game.PlaceId, '${data.jobId}', game.Players.LocalPlayer)\n`);
    awaitingSelection = null;
    return true;
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.end();
        return;
    }

    if (req.url === '/report' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { jobId, ageMinutes } = data;
                if (jobId) {
                    db.servers[jobId] = {
                        ageAtScan: ageMinutes,
                        timestamp: Math.floor(Date.now() / 1000)
                    };
                    saveDb();
                    console.log(`\n[REPORT] Server: ${jobId.substring(0, 8)}... | Tuoi: ${ageMinutes}m`);
                }
            } catch (e) {}
            res.end('OK');
        });
    } else if (req.url === '/report-find' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { type, name, jobId } = data;
                if (type && name && jobId) {
                    const entry = { jobId, timestamp: Math.floor(Date.now() / 1000) };
                    if (type === 'player') {
                        db.players[name] = entry;
                        console.log(`\n[PLAYER FOUND] ${name} | ${jobId.substring(0, 8)}...`);
                    } else if (type === 'gang') {
                        db.gangs[name] = entry;
                        console.log(`\n[GANG FOUND] ${name} | ${jobId.substring(0, 8)}...`);
                    }
                    saveDb();
                }
            } catch (e) {}
            res.end('OK');
        });
    } else if (req.url === '/scan-jobids' && req.method === 'POST') {
        // API to scan new JobIds
        console.log('\n[API] Bắt đầu quét JobId mới...');
        jobIdScanner.scanNewJobIds().then(result => {
            console.log(`[API] Quét hoàn thành: ${JSON.stringify(result)}`);
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'JobId scanning started' }));
    } else if (req.url === '/status' && req.method === 'GET') {
        // API to get system status
        const scannerStatus = jobIdScanner.getStatus();
        const status = {
            scanner: scannerStatus,
            database: {
                servers: Object.keys(db.servers).length,
                players: Object.keys(db.players).length,
                gangs: Object.keys(db.gangs).length
            }
        };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(status, null, 2));
    } else if (req.url.startsWith('/next/') && req.method === 'GET') {
        // Get next JobId with thread ID: /next/thread1
        const threadId = req.url.split('/')[2] || 'default';
        const nextId = jobIdScanner.getNextJobId(threadId);
        
        if (nextId) {
            console.log(`\n[DISPATCH] Thread ${threadId}: Gửi JobId ${nextId.substring(0, 8)}... (Available: ${jobIdScanner.getStatus().available})`);
            res.end(nextId);
        } else {
            // Auto scan if empty
            console.log(`\n[AUTO-SCAN] Hết JobId, tự động quét mới...`);
            jobIdScanner.scanNewJobIds().then(() => {
                const newJobId = jobIdScanner.getNextJobId(threadId);
                if (newJobId) {
                    console.log(`[AUTO-SCAN] Gửi JobId mới: ${newJobId.substring(0, 8)}...`);
                    res.end(newJobId);
                } else {
                    res.end('NONE');
                }
            }).catch(() => {
                res.end('NONE');
            });
        }
    } else if (req.url === '/complete' && req.method === 'POST') {
        // Mark JobId as completed
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { jobId, result } = JSON.parse(body);
                if (jobId) {
                    jobIdScanner.markJobIdCompleted(jobId, result);
                    console.log(`\n[COMPLETE] JobId ${jobId.substring(0, 8)}... đã hoàn thành (${result || 'completed'})`);
                }
            } catch (e) {}
            res.end('OK');
        });
    } else if (req.url === '/report-full' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { jobId } = JSON.parse(body);
                if (jobId) {
                    jobIdScanner.markServerFull(jobId);
                    console.log(`\n[FULL] Server full: ${jobId.substring(0, 8)}...`);
                }
            } catch (e) {}
            res.end('OK');
        });
    } else if (req.url === '/next' && req.method === 'GET') {
        // Legacy endpoint
        const nextId = jobIdScanner.getNextJobId('legacy');
        if (nextId) {
            console.log(`\n[DISPATCH] Legacy: Gửi JobId ${nextId.substring(0, 8)}... (Available: ${jobIdScanner.getStatus().available})`);
            res.end(nextId);
        } else {
            res.end('NONE');
        }
    } else if (req.url === '/join' && req.method === 'GET') {
        if (pendingJoinJobId) {
            const jobId = pendingJoinJobId;
            pendingJoinJobId = null;
            console.log(`\n[JOIN] Da gui lenh join: ${jobId.substring(0, 8)}...`);
            res.end(jobId);
        } else {
            res.end('NONE');
        }
    } else {
        res.end('Rift Brain Central is Running...');
    }
});

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 RIFT BRAIN CENTRAL V2 - TONG DAI DIEU PHOI`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    const status = jobIdScanner.getStatus();
    console.log(`📊 JobId Status: ${status.available} available, ${status.scanning} scanning`);
    console.log(`--------------------------------------------------`);
    console.log(`API Endpoints:`);
    console.log(`  POST /scan-jobids - Quét JobId mới`);
    console.log(`  GET  /status - Xem trạng thái hệ thống`);
    console.log(`  GET  /next/threadId - Lấy JobId theo thread`);
    console.log(`  POST /complete - Đánh dấu hoàn thành`);
    console.log(`Lenh: /rift, /boss, /list, /clear, /reload`);
    console.log(`      /player, /gang, /joinplayer, /joingang`);
    console.log(`      /scan - Quét JobId mới`);
    console.log(`==================================================\n`);
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', (line) => {
    const raw = line.trim();
    const cmd = raw.toLowerCase();

    if (awaitingSelection) {
        handleSelection(raw);
        return;
    }

    if (cmd === '/rift' || cmd === 'rift') findServers('Rift');
    else if (cmd === '/boss' || cmd === 'boss') findServers('Boss');
    else if (cmd === '/scan') {
        console.log('🚀 Bắt đầu quét JobId mới...');
        jobIdScanner.scanNewJobIds().then(result => {
            console.log(`✅ Quét hoàn thành: ${JSON.stringify(result)}`);
        }).catch(err => {
            console.log(`❌ Lỗi quét: ${err.message}`);
        });
    } else if (cmd === '/status') {
        const status = jobIdScanner.getStatus();
        console.log(`\n--- SYSTEM STATUS ---`);
        console.log(`JobId Available: ${status.available}`);
        console.log(`JobId Scanning: ${status.scanning}`);
        console.log(`JobId Failed: ${status.failed}`);
        console.log(`JobId Used: ${status.used}`);
        console.log(`Servers DB: ${Object.keys(db.servers).length}`);
        console.log(`Players DB: ${Object.keys(db.players).length}`);
        console.log(`Gangs DB: ${Object.keys(db.gangs).length}`);
    } else if (cmd === '/reload') {
        jobIdScanner.loadData();
        console.log(`✅ Đã reload dữ liệu JobId Scanner.`);
    } else if (cmd === '/list') {
        console.log(`\n--- SERVER DATABASE (${Object.keys(db.servers).length}) ---`);
        for (const id in db.servers) console.log(`- ${id.substring(0, 8)}...: ${calculateCurrentAge(id)}m`);
    } else if (cmd === '/player') showPlayerList();
    else if (cmd === '/gang') showGangList();
    else if (cmd === '/joinplayer') showJoinList('player');
    else if (cmd === '/joingang') showJoinList('gang');
    else if (cmd === '/clear') {
        db = { servers: {}, players: {}, gangs: {} };
        saveDb();
        console.log('🧹 Database cleared.');
    }
});

function findServers(type) {
    const found = [];
    console.log(`\n🔍 DANG TIM ${type.toUpperCase()}...`);
    for (const jobId in db.servers) {
        const age = calculateCurrentAge(jobId);
        let diff = 0;
        let target = '';

        if (type === 'Rift') {
            const cycle = Math.round(age / 90);
            if (cycle === 0) continue;
            diff = (cycle * 90) - age;
            target = (cycle * 90) / 60 + 'h00';
        } else {
            const h = Math.floor(age / 60);
            const m = age % 60;
            if (h % 2 === 0) diff = (60 - m) + 55;
            else diff = 55 - m;
            target = 'Boss';
        }

        if (diff >= -15 && diff <= 15) found.push({ jobId, age, diff, target });
    }

    if (found.length > 0) {
        found.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
        found.forEach(s => {
            const status = s.diff > 0 ? `SAP CO (con ${s.diff}p)` : `VUA CO (${Math.abs(s.diff)}p truoc)`;
            console.log(`✅ [${s.target}] Server: ${s.jobId}`);
            console.log(`   - Tuoi: ${Math.floor(s.age / 60)}h${s.age % 60}m | Trang thai: ${status}`);
            console.log(`   - Join: game:GetService('TeleportService'):TeleportToPlaceInstance(game.PlaceId, '${s.jobId}', game.Players.LocalPlayer)\n`);
        });
    } else {
        console.log(`❌ Khong tim thay server nao gan moc ${type}.`);
    }
}