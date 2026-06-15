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

// Auto cleanup old data every 6 hours (để kịp thời clear server 38h)
setInterval(() => {
    cleanupOldData();
}, 6 * 60 * 60 * 1000);

// Cleanup old data function - Dựa trên server age 38 tiếng
function cleanupOldData() {
    let cleanedCount = { servers: 0, players: 0, gangs: 0 };
    const maxServerAge = 38 * 60; // 38 tiếng = 2280 phút
    const now = Math.floor(Date.now() / 1000);

    // Clean servers based on calculated age (38 hours = 2280 minutes)
    const serversToDelete = [];
    for (const [jobId, data] of Object.entries(db.servers)) {
        const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
        
        if (currentAge >= maxServerAge) {
            serversToDelete.push(jobId);
            cleanedCount.servers++;
        }
    }

    // Delete old servers
    serversToDelete.forEach(jobId => {
        delete db.servers[jobId];
    });

    // Clean players from old servers
    const playersToDelete = [];
    for (const [name, data] of Object.entries(db.players)) {
        if (serversToDelete.includes(data.jobId)) {
            playersToDelete.push(name);
            cleanedCount.players++;
        }
    }

    // Delete players from old servers
    playersToDelete.forEach(name => {
        delete db.players[name];
    });

    // Clean gangs from old servers
    const gangsToDelete = [];
    for (const [name, data] of Object.entries(db.gangs)) {
        if (serversToDelete.includes(data.jobId)) {
            gangsToDelete.push(name);
            cleanedCount.gangs++;
        }
    }

    // Delete gangs from old servers
    gangsToDelete.forEach(name => {
        delete db.gangs[name];
    });

    if (cleanedCount.servers > 0 || cleanedCount.players > 0 || cleanedCount.gangs > 0) {
        saveDb();
        console.log(`\n🧹 [AUTO-CLEANUP] Cleaned data from servers ≥38h old:`);
        console.log(`   Servers: ${cleanedCount.servers}`);
        console.log(`   Players: ${cleanedCount.players}`);
        console.log(`   Gangs: ${cleanedCount.gangs}`);
        
        if (serversToDelete.length > 0) {
            console.log(`   Example old servers: ${serversToDelete.slice(0, 3).map(id => id.substring(0, 8) + '...').join(', ')}`);
        }
    }
}

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
    } else if (req.url === '/clear-data' && req.method === 'POST') {
        // Clear data API endpoint
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { type, confirm } = JSON.parse(body);
                
                if (!confirm) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Confirmation required' }));
                    return;
                }

                const beforeCount = {
                    servers: Object.keys(db.servers).length,
                    players: Object.keys(db.players).length,
                    gangs: Object.keys(db.gangs).length
                };

                if (type === 'all') {
                    db = { servers: {}, players: {}, gangs: {} };
                } else if (type === 'players') {
                    db.players = {};
                } else if (type === 'gangs') {
                    db.gangs = {};
                } else if (type === 'servers') {
                    db.servers = {};
                } else if (type === 'old') {
                    const maxServerAge = 38 * 60; // 38 tiếng = 2280 phút
                    const now = Math.floor(Date.now() / 1000);
                    
                    // Find servers ≥38h old based on server age
                    const serversToDelete = [];
                    for (const [jobId, data] of Object.entries(db.servers)) {
                        const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
                        
                        if (currentAge >= maxServerAge) {
                            serversToDelete.push(jobId);
                        }
                    }

                    // Delete old servers
                    serversToDelete.forEach(jobId => {
                        delete db.servers[jobId];
                    });

                    // Delete players from old servers
                    for (const [name, data] of Object.entries(db.players)) {
                        if (serversToDelete.includes(data.jobId)) {
                            delete db.players[name];
                        }
                    }
                    
                    // Delete gangs from old servers
                    for (const [name, data] of Object.entries(db.gangs)) {
                        if (serversToDelete.includes(data.jobId)) {
                            delete db.gangs[name];
                        }
                    }
                }

                saveDb();

                const afterCount = {
                    servers: Object.keys(db.servers).length,
                    players: Object.keys(db.players).length,
                    gangs: Object.keys(db.gangs).length
                };

                const result = {
                    success: true,
                    type: type,
                    before: beforeCount,
                    after: afterCount,
                    cleared: {
                        servers: beforeCount.servers - afterCount.servers,
                        players: beforeCount.players - afterCount.players,
                        gangs: beforeCount.gangs - afterCount.gangs
                    }
                };

                console.log(`\n[API] Database cleared (${type}):`, result.cleared);
                
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
            } catch (e) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.url === '/join' && req.method === 'GET') {
        if (pendingJoinJobId) {
            const jobId = pendingJoinJobId;
            pendingJoinJobId = null;
            console.log(`\n[JOIN] Da gui lenh join: ${jobId.substring(0, 8)}...`);
            res.end(jobId);
        } else {
            res.end('NONE');
        }
    } else if (req.url.startsWith('/player') && req.method === 'GET') {
        // Search player endpoint: /player?name=playername
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const playerName = url.searchParams.get('name');
        
        if (!playerName) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Player name is required' }));
            return;
        }

        const results = [];
        for (const [name, data] of Object.entries(db.players)) {
            if (name.toLowerCase().includes(playerName.toLowerCase())) {
                results.push({
                    displayName: name,
                    jobId: data.jobId,
                    leaderstats: data.leaderstats || {},
                    timestamp: data.timestamp
                });
            }
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

    } else if (req.url.startsWith('/gang') && req.method === 'GET') {
        // Search gang endpoint: /gang?name=gangname
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const gangName = url.searchParams.get('name');
        
        if (!gangName) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Gang name is required' }));
            return;
        }

        const results = [];
        for (const [name, data] of Object.entries(db.gangs)) {
            if (name.toLowerCase().includes(gangName.toLowerCase())) {
                results.push({
                    Name: name,
                    jobId: data.jobId,
                    MemberCount: data.MemberCount || 'N/A',
                    Owner: data.Owner || 'N/A',
                    timestamp: data.timestamp
                });
            }
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

    } else if (req.url === '/boss' && req.method === 'GET') {
        // Find boss servers endpoint
        const results = [];
        const now = Math.floor(Date.now() / 1000);
        
        for (const [jobId, data] of Object.entries(db.servers)) {
            const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
            const hours = Math.floor(currentAge / 60);
            const minutes = currentAge % 60;
            
            // Boss spawn logic: odd hours at minute 55
            let timeToBoss = 0;
            if (hours % 2 === 0) {
                // Even hour -> boss at next odd hour minute 55
                timeToBoss = (60 - minutes) + 55;
            } else {
                // Odd hour -> boss at minute 55
                timeToBoss = 55 - minutes;
                if (timeToBoss < 0) timeToBoss += 120; // Next cycle
            }
            
            // Only include servers within ±10 minutes of boss spawn
            if (Math.abs(timeToBoss) <= 10 || (timeToBoss >= 110 && timeToBoss <= 130)) {
                results.push({
                    jobId: jobId,
                    serverTime: `${hours}h ${minutes}m`,
                    bossTimeLeft: `${timeToBoss > 0 ? '+' : ''}${timeToBoss}m`,
                    status: timeToBoss <= 0 ? 'spawned' : 'coming'
                });
            }
        }
        
        // Sort by closest to boss time
        results.sort((a, b) => {
            const aTime = parseInt(a.bossTimeLeft.replace(/[^\-\d]/g, ''));
            const bTime = parseInt(b.bossTimeLeft.replace(/[^\-\d]/g, ''));
            return Math.abs(aTime) - Math.abs(bTime);
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

    } else if (req.url === '/rift' && req.method === 'GET') {
        // Find rift servers endpoint  
        const results = [];
        const now = Math.floor(Date.now() / 1000);
        
        for (const [jobId, data] of Object.entries(db.servers)) {
            const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
            
            // Rift spawn logic: every 90 minutes after 10 minutes
            const cycle = Math.floor((currentAge + 10) / 90);
            if (cycle > 0) {
                const spawnTime = cycle * 90;
                const timeToRift = spawnTime - currentAge;
                
                // Only include servers within ±10 minutes of rift spawn
                if (Math.abs(timeToRift) <= 10) {
                    const hours = Math.floor(currentAge / 60);
                    const minutes = currentAge % 60;
                    
                    results.push({
                        jobId: jobId,
                        serverTime: `${hours}h ${minutes}m`,
                        riftTimeLeft: `${timeToRift > 0 ? '+' : ''}${timeToRift}m`,
                        status: timeToRift <= 0 ? 'spawned' : 'coming'
                    });
                }
            }
        }
        
        // Sort by closest to rift time
        results.sort((a, b) => {
            const aTime = parseInt(a.riftTimeLeft.replace(/[^\-\d]/g, ''));
            const bTime = parseInt(b.riftTimeLeft.replace(/[^\-\d]/g, ''));
            return Math.abs(aTime) - Math.abs(bTime);
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

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
    console.log(`  POST /clear-data - Clear database`);
    console.log(`Lenh: /rift, /boss, /list, /reload`);
    console.log(`      /player, /gang, /joinplayer, /joingang`);
    console.log(`      /scan - Quét JobId mới`);
    console.log(`      /ages - Hiển thị server ages (monitor 38h limit)`);
    console.log(`      /clear [confirm|old|players|gangs|servers] - Clear data`);
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
    } else if (cmd.startsWith('/clear')) {
        const parts = cmd.split(' ');
        const type = parts[1] || 'confirm';
        
        if (type === 'confirm') {
            const beforeCount = {
                servers: Object.keys(db.servers).length,
                players: Object.keys(db.players).length,
                gangs: Object.keys(db.gangs).length
            };
            
            db = { servers: {}, players: {}, gangs: {} };
            saveDb();
            
            console.log(`🧹 Database cleared completely.`);
            console.log(`   Servers: ${beforeCount.servers} → 0`);
            console.log(`   Players: ${beforeCount.players} → 0`);
            console.log(`   Gangs: ${beforeCount.gangs} → 0`);
        } else if (type === 'old') {
            const maxServerAge = 38 * 60; // 38 tiếng = 2280 phút
            const now = Math.floor(Date.now() / 1000);
            let cleanedCount = { servers: 0, players: 0, gangs: 0 };

            // Find servers ≥38h old based on server age
            const serversToDelete = [];
            for (const [jobId, data] of Object.entries(db.servers)) {
                const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
                
                if (currentAge >= maxServerAge) {
                    serversToDelete.push(jobId);
                    cleanedCount.servers++;
                }
            }

            // Delete old servers
            serversToDelete.forEach(jobId => {
                delete db.servers[jobId];
            });

            // Delete players from old servers
            for (const [name, data] of Object.entries(db.players)) {
                if (serversToDelete.includes(data.jobId)) {
                    delete db.players[name];
                    cleanedCount.players++;
                }
            }

            // Delete gangs from old servers  
            for (const [name, data] of Object.entries(db.gangs)) {
                if (serversToDelete.includes(data.jobId)) {
                    delete db.gangs[name];
                    cleanedCount.gangs++;
                }
            }

            saveDb();
            console.log(`🧹 Cleared data from servers ≥38h old:`);
            console.log(`   Servers: ${cleanedCount.servers}`);
            console.log(`   Players: ${cleanedCount.players}`);
            console.log(`   Gangs: ${cleanedCount.gangs}`);
            if (serversToDelete.length > 0) {
                console.log(`   Example: ${serversToDelete.slice(0, 3).map(id => id.substring(0, 8) + '...').join(', ')}`);
            }
        } else if (type === 'players') {
            const count = Object.keys(db.players).length;
            db.players = {};
            saveDb();
            console.log(`🧹 Cleared ${count} players.`);
        } else if (type === 'gangs') {
            const count = Object.keys(db.gangs).length;
            db.gangs = {};
            saveDb();
            console.log(`🧹 Cleared ${count} gangs.`);
        } else if (type === 'servers') {
            const count = Object.keys(db.servers).length;
            db.servers = {};
            saveDb();
            console.log(`🧹 Cleared ${count} servers.`);
        } else {
            console.log(`❌ Usage: /clear [confirm|old|players|gangs|servers]`);
            console.log(`   /clear confirm - Clear all data`);
            console.log(`   /clear old - Clear servers ≥38h old (+ their players/gangs)`);
            console.log(`   /clear players - Clear players only`);
            console.log(`   /clear gangs - Clear gangs only`);
            console.log(`   /clear servers - Clear servers only`);
        }
    } else if (cmd === '/ages' || cmd === 'ages') {
        console.log(`\n--- SERVER AGES ---`);
        const now = Math.floor(Date.now() / 1000);
        const servers = Object.entries(db.servers);
        
        if (servers.length === 0) {
            console.log('❌ Chưa có server nào trong database.');
        } else {
            // Sort by age (oldest first)
            servers.sort((a, b) => {
                const ageA = a[1].ageAtScan + Math.floor((now - a[1].timestamp) / 60);
                const ageB = b[1].ageAtScan + Math.floor((now - b[1].timestamp) / 60);
                return ageB - ageA;
            });

            console.log(`Total servers: ${servers.length}`);
            console.log('Oldest 10 servers:');
            
            servers.slice(0, 10).forEach(([jobId, data]) => {
                const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
                const hours = Math.floor(currentAge / 60);
                const minutes = currentAge % 60;
                const isOld = currentAge >= 38 * 60;
                const marker = isOld ? '🔴 OLD' : '🟢';
                
                console.log(`${marker} ${jobId.substring(0, 8)}... → ${hours}h${minutes}m`);
            });

            // Count old servers
            const oldCount = servers.filter(([jobId, data]) => {
                const age = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
                return age >= 38 * 60;
            }).length;

            console.log(`\n🔴 Servers ≥38h old: ${oldCount}/${servers.length}`);
        }
    } else if (cmd === '/list') {
        console.log(`\n--- SERVER DATABASE (${Object.keys(db.servers).length}) ---`);
        for (const id in db.servers) console.log(`- ${id.substring(0, 8)}...: ${calculateCurrentAge(id)}m`);
    } else if (cmd === '/player') showPlayerList();
    else if (cmd === '/gang') showGangList();
    else if (cmd === '/joinplayer') showJoinList('player');
    else if (cmd === '/joingang') showJoinList('gang');
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