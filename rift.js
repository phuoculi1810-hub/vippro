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
                    // Update server data (ageMinutes, timestamp) - allows updates to same JobId
                    if (!db.servers[jobId]) {
                        db.servers[jobId] = {};
                    }
                    db.servers[jobId].ageAtScan = ageMinutes;
                    db.servers[jobId].timestamp = Math.floor(Date.now() / 1000);
                    saveDb();
                    console.log(`\n[REPORT] Server: ${jobId.substring(0, 8)}... | Tuoi: ${ageMinutes}m`);
                }
            } catch (e) {}
            res.end('OK');
        });
    } else if (req.url === '/report-boss' && req.method === 'POST') {
        // Report Boss server
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { jobId, info, ageMinutes } = JSON.parse(body);
                if (jobId) {
                    // Mark as boss server in database
                    if (!db.servers[jobId]) {
                        db.servers[jobId] = {};
                    }
                    db.servers[jobId].boss = info;
                    db.servers[jobId].ageAtScan = ageMinutes;
                    db.servers[jobId].timestamp = Math.floor(Date.now() / 1000);
                    saveDb();
                    console.log(`\n[BOSS] Server: ${jobId.substring(0, 8)}... | ${info} | Age: ${ageMinutes}m`);
                }
            } catch (e) {}
            res.end('OK');
        });
    } else if (req.url === '/report-rift' && req.method === 'POST') {
        // Report Rift server
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { jobId, info, ageMinutes } = JSON.parse(body);
                if (jobId) {
                    // Mark as rift server in database
                    if (!db.servers[jobId]) {
                        db.servers[jobId] = {};
                    }
                    db.servers[jobId].rift = info;
                    db.servers[jobId].ageAtScan = ageMinutes;
                    db.servers[jobId].timestamp = Math.floor(Date.now() / 1000);
                    saveDb();
                    console.log(`\n[RIFT] Server: ${jobId.substring(0, 8)}... | ${info} | Age: ${ageMinutes}m`);
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
                    const timestamp = Math.floor(Date.now() / 1000);
                    
                    if (type === 'player') {
                        // PLAYER: Chỉ lưu JobId mới nhất (xóa JobId cũ)
                        db.players[name] = {
                            jobId: jobId,
                            timestamp: timestamp
                        };
                        console.log(`\n[PLAYER FOUND] ${name} | ${jobId.substring(0, 8)}... (updated to latest)`);
                    } else if (type === 'gang') {
                        // GANG: Lưu tất cả JobIds (multiple servers)
                        // If same JobId scanned again with different gang, UPDATE gang list + timestamp
                        if (!db.gangs[name]) {
                            db.gangs[name] = {};
                        }
                        db.gangs[name][jobId] = timestamp; // Update timestamp if already exists
                        console.log(`\n[GANG FOUND] ${name} | ${jobId.substring(0, 8)}... (total servers: ${Object.keys(db.gangs[name]).length})`);
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
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
        }).catch(err => {
            console.error(`[API] Lỗi quét JobId: ${err.message}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
                success: false, 
                error: err.message 
            }));
        });
    } else if (req.url === '/add-jobids' && req.method === 'POST') {
        // API to manually add JobIds to queue
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { jobIds, password } = JSON.parse(body);

                // Check password nếu được gửi từ website (bỏ qua nếu không có để tương thích Discord bot)
                if (password !== undefined) {
                    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'asura2024';
                    if (password !== ADMIN_PASSWORD) {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: 'Sai password!' }));
                        return;
                    }
                }
                
                if (!Array.isArray(jobIds) || jobIds.length === 0) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'jobIds must be a non-empty array' 
                    }));
                    return;
                }

                console.log(`\n[API] Thêm thủ công ${jobIds.length} JobIds...`);
                const result = jobIdScanner.addJobIdsManually(jobIds);
                
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    success: true,
                    added: result.totalAdded,
                    skipped: result.totalSkipped,
                    details: result
                }));
            } catch (e) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ 
                    success: false, 
                    error: e.message 
                }));
            }
        });
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
                // PLAYER: Chỉ có 1 JobId (mới nhất)
                results.push({
                    displayName: name,
                    jobId: data.jobId,
                    timestamp: data.timestamp
                });
            }
        }

        // Sort by most recent first
        results.sort((a, b) => b.timestamp - a.timestamp);

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
        for (const [name, servers] of Object.entries(db.gangs)) {
            if (name.toLowerCase().includes(gangName.toLowerCase())) {
                // Convert all servers for this gang
                for (const [jobId, timestamp] of Object.entries(servers)) {
                    results.push({
                        Name: name,
                        jobId: jobId,
                        timestamp: timestamp
                    });
                }
            }
        }

        // Sort by most recent first
        results.sort((a, b) => b.timestamp - a.timestamp);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

    } else if (req.url === '/boss' && req.method === 'GET') {
        // Find boss servers endpoint
        const results = [];
        const now = Math.floor(Date.now() / 1000);
        
        for (const [jobId, data] of Object.entries(db.servers)) {
            // Skip if this server doesn't have boss info
            if (!data.boss) continue;
            
            const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
            const hours = Math.floor(currentAge / 60);
            const minutes = currentAge % 60;
            
            // Parse boss info from Lua script (e.g., "spawn_in_5m" or "spawn_2m_ago")
            let displayText = '';
            if (data.boss.includes('spawn_in_')) {
                const mins = data.boss.match(/\d+/)[0];
                displayText = `Spawn sau ${mins} phút`;
            } else if (data.boss.includes('spawn_') && data.boss.includes('_ago')) {
                const mins = data.boss.match(/\d+/)[0];
                displayText = `Đã spawn ${mins} phút trước`;
            }
            
            results.push({
                jobId: jobId,
                serverTime: `${hours}h ${minutes}m`,
                bossTimeLeft: displayText,
                status: data.boss.includes('_ago') ? 'spawned' : 'coming'
            });
        }
        
        // Sort: spawned first, then by closest to spawn
        results.sort((a, b) => {
            if (a.status === 'spawned' && b.status !== 'spawned') return -1;
            if (a.status !== 'spawned' && b.status === 'spawned') return 1;
            return 0;
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

    } else if (req.url === '/rift' && req.method === 'GET') {
        // Find rift servers endpoint  
        const results = [];
        const now = Math.floor(Date.now() / 1000);
        
        for (const [jobId, data] of Object.entries(db.servers)) {
            // Skip if this server doesn't have rift info
            if (!data.rift) continue;
            
            const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
            const hours = Math.floor(currentAge / 60);
            const minutes = currentAge % 60;
            
            // Parse rift info from Lua script (e.g., "spawn_in_5m" or "spawn_2m_ago")
            let displayText = '';
            if (data.rift.includes('spawn_in_')) {
                const mins = data.rift.match(/\d+/)[0];
                displayText = `Spawn sau ${mins} phút`;
            } else if (data.rift.includes('spawn_') && data.rift.includes('_ago')) {
                const mins = data.rift.match(/\d+/)[0];
                displayText = `Đã spawn ${mins} phút trước`;
            }
            
            results.push({
                jobId: jobId,
                serverTime: `${hours}h ${minutes}m`,
                riftTimeLeft: displayText,
                status: data.rift.includes('_ago') ? 'spawned' : 'coming'
            });
        }
        
        // Sort: spawned first, then by closest to spawn
        results.sort((a, b) => {
            if (a.status === 'spawned' && b.status !== 'spawned') return -1;
            if (a.status !== 'spawned' && b.status === 'spawned') return 1;
            return 0;
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: results }));

    } else if (req.url === '/' && req.method === 'GET') {
        // =============================================
        // ADMIN WEBSITE - Quản lý JobId
        // =============================================
        const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Asura JobId Manager</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', sans-serif;
    background: #0f0f1a;
    color: #e0e0e0;
    min-height: 100vh;
    padding: 20px;
  }
  h1 {
    text-align: center;
    color: #7c6af7;
    margin-bottom: 6px;
    font-size: 1.6rem;
  }
  .subtitle { text-align: center; color: #888; font-size: 0.85rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 900px; margin: 0 auto; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  .card {
    background: #1a1a2e;
    border: 1px solid #2e2e4e;
    border-radius: 12px;
    padding: 20px;
  }
  .card h2 { color: #a78bfa; font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  label { display: block; font-size: 0.8rem; color: #aaa; margin-bottom: 5px; margin-top: 12px; }
  input[type=password], textarea {
    width: 100%;
    background: #0f0f1a;
    border: 1px solid #3a3a5e;
    border-radius: 8px;
    color: #e0e0e0;
    padding: 10px 12px;
    font-size: 0.88rem;
    outline: none;
    transition: border 0.2s;
  }
  input[type=password]:focus, textarea:focus { border-color: #7c6af7; }
  textarea { resize: vertical; min-height: 120px; font-family: monospace; line-height: 1.5; }
  button {
    width: 100%;
    margin-top: 14px;
    padding: 11px;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
  }
  button:active { transform: scale(0.98); }
  .btn-up { background: linear-gradient(135deg, #7c6af7, #5b4fcf); color: #fff; }
  .btn-clear { background: linear-gradient(135deg, #e53e3e, #9b2c2c); color: #fff; }
  .btn-status { background: linear-gradient(135deg, #2b6cb0, #1a4a7a); color: #fff; }
  .result {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.82rem;
    line-height: 1.6;
    display: none;
    word-break: break-all;
  }
  .result.success { background: #1a3a1a; border: 1px solid #38a169; color: #68d391; }
  .result.error { background: #3a1a1a; border: 1px solid #e53e3e; color: #fc8181; }
  .status-box {
    grid-column: 1 / -1;
  }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-top: 10px; }
  .stat {
    background: #0f0f1a;
    border: 1px solid #2e2e4e;
    border-radius: 8px;
    padding: 12px 8px;
    text-align: center;
  }
  .stat .num { font-size: 1.5rem; font-weight: 700; color: #a78bfa; }
  .stat .lbl { font-size: 0.72rem; color: #888; margin-top: 3px; }
  .clear-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .btn-sm {
    margin-top: 0;
    padding: 9px 6px;
    font-size: 0.8rem;
    background: #2a1a3e;
    border: 1px solid #4a3a6e;
    color: #c0a0ff;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-sm:hover { background: #3a2a5e; }
  .btn-sm.danger { background: #2a1010; border-color: #6e2020; color: #ff8080; }
  .btn-sm.danger:hover { background: #3e1515; }
  .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid #fff3; border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<h1>⚔️ Asura JobId Manager</h1>
<p class="subtitle">Quản lý JobId Queue cho hệ thống scanner</p>

<div class="grid">

  <!-- UP JOBID -->
  <div class="card">
    <h2>📥 Up JobId</h2>
    <label>Password admin</label>
    <input type="password" id="up-pass" placeholder="Nhập password...">
    <label>Danh sách JobId (mỗi dòng 1 JobId)</label>
    <textarea id="up-jobids" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx&#10;yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy&#10;..."></textarea>
    <button class="btn-up" onclick="uploadJobIds()">📤 Up vào Queue</button>
    <div class="result" id="up-result"></div>
  </div>

  <!-- CLEAR JOBID QUEUE -->
  <div class="card">
    <h2>🗑️ Clear JobId Queue</h2>
    <label>Password admin</label>
    <input type="password" id="clear-pass" placeholder="Nhập password...">
    <label>Chọn loại xóa</label>
    <div class="clear-grid">
      <button class="btn-sm" onclick="clearQueue('available')">🟢 Available Queue</button>
      <button class="btn-sm" onclick="clearQueue('scanning')">🔄 Scanning Queue</button>
      <button class="btn-sm" onclick="clearQueue('failed')">❌ Failed Queue</button>
      <button class="btn-sm" onclick="clearQueue('used')">📋 Used List</button>
      <button class="btn-sm danger" style="grid-column:1/-1" onclick="clearQueue('all-queues')">💥 Xóa Tất Cả Queue</button>
    </div>
    <div class="result" id="clear-result"></div>
  </div>

  <!-- STATUS -->
  <div class="card status-box">
    <h2>📊 Trạng thái hệ thống</h2>
    <button class="btn-status" onclick="loadStatus()">🔄 Refresh Status</button>
    <div class="stats" id="stats">
      <div class="stat"><div class="num" id="s-available">-</div><div class="lbl">Available</div></div>
      <div class="stat"><div class="num" id="s-scanning">-</div><div class="lbl">Scanning</div></div>
      <div class="stat"><div class="num" id="s-failed">-</div><div class="lbl">Failed</div></div>
      <div class="stat"><div class="num" id="s-used">-</div><div class="lbl">Used</div></div>
      <div class="stat"><div class="num" id="s-servers">-</div><div class="lbl">DB Servers</div></div>
      <div class="stat"><div class="num" id="s-players">-</div><div class="lbl">DB Players</div></div>
      <div class="stat"><div class="num" id="s-gangs">-</div><div class="lbl">DB Gangs</div></div>
    </div>
    <div class="result" id="status-result"></div>
  </div>

</div>

<script>
const API = '';

function showResult(id, msg, ok) {
  const el = document.getElementById(id);
  el.className = 'result ' + (ok ? 'success' : 'error');
  el.style.display = 'block';
  el.innerHTML = msg;
}

function setLoading(btn, loading) {
  if (loading) {
    btn._orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>Đang xử lý...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._orig;
    btn.disabled = false;
  }
}

async function uploadJobIds() {
  const pass = document.getElementById('up-pass').value.trim();
  const raw  = document.getElementById('up-jobids').value.trim();
  if (!pass) return showResult('up-result', '⚠️ Nhập password trước.', false);
  if (!raw)  return showResult('up-result', '⚠️ Nhập ít nhất 1 JobId.', false);

  const jobIds = raw.split('\\n').map(s => s.trim()).filter(s => s.length > 0);
  const btn = event.currentTarget;
  setLoading(btn, true);

  try {
    const r = await fetch(API + '/add-jobids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass, jobIds })
    });
    const d = await r.json();
    if (d.success) {
      showResult('up-result',
        '✅ Thêm thành công!<br>' +
        '➕ Đã thêm: <b>' + d.added + '</b> JobIds<br>' +
        '⏭️ Bỏ qua: <b>' + d.skipped + '</b> (trùng hoặc đã dùng)', true);
      loadStatus();
    } else {
      showResult('up-result', '❌ ' + (d.error || 'Lỗi không xác định'), false);
    }
  } catch(e) {
    showResult('up-result', '❌ Không kết nối được server: ' + e.message, false);
  }
  setLoading(btn, false);
}

async function clearQueue(type) {
  const pass = document.getElementById('clear-pass').value.trim();
  if (!pass) return showResult('clear-result', '⚠️ Nhập password trước.', false);

  const labels = {
    'available': 'Available Queue',
    'scanning': 'Scanning Queue',
    'failed': 'Failed Queue',
    'used': 'Used List',
    'all-queues': 'Tất cả Queue'
  };
  if (!confirm('Xác nhận xóa ' + labels[type] + '?')) return;

  try {
    const r = await fetch(API + '/clear-jobid-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass, type })
    });
    const d = await r.json();
    if (d.success) {
      showResult('clear-result',
        '✅ Đã xóa <b>' + labels[type] + '</b><br>' +
        '🗑️ Số lượng đã xóa: <b>' + d.cleared + '</b>', true);
      loadStatus();
    } else {
      showResult('clear-result', '❌ ' + (d.error || 'Lỗi không xác định'), false);
    }
  } catch(e) {
    showResult('clear-result', '❌ Không kết nối được server: ' + e.message, false);
  }
}

async function loadStatus() {
  const btn = document.querySelector('.btn-status');
  setLoading(btn, true);
  document.getElementById('status-result').style.display = 'none';
  try {
    const r = await fetch(API + '/status');
    const d = await r.json();
    document.getElementById('s-available').textContent = d.scanner.available ?? '-';
    document.getElementById('s-scanning').textContent  = d.scanner.scanning ?? '-';
    document.getElementById('s-failed').textContent    = d.scanner.failed ?? '-';
    document.getElementById('s-used').textContent      = d.scanner.used ?? '-';
    document.getElementById('s-servers').textContent   = d.database.servers ?? '-';
    document.getElementById('s-players').textContent   = d.database.players ?? '-';
    document.getElementById('s-gangs').textContent     = d.database.gangs ?? '-';
  } catch(e) {
    showResult('status-result', '❌ Không lấy được status: ' + e.message, false);
  }
  setLoading(btn, false);
}

// Load status on page open
loadStatus();
</script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);

    } else if (req.url === '/dashboard' && req.method === 'GET') {
        // =============================================
        // DASHBOARD WEBSITE - Xem data Player/Gang/Server
        // =============================================
        const dashHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Asura Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; }

  /* HEADER */
  .header { background: #1a1a2e; border-bottom: 1px solid #2e2e4e; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 1.2rem; color: #a78bfa; }
  .header .stats-bar { display: flex; gap: 16px; }
  .stat-pill { background: #0f0f1a; border: 1px solid #2e2e4e; border-radius: 20px; padding: 4px 14px; font-size: 0.78rem; color: #aaa; }
  .stat-pill span { color: #a78bfa; font-weight: 700; }

  /* TABS */
  .tabs { display: flex; gap: 4px; padding: 16px 24px 0; }
  .tab { padding: 9px 20px; border-radius: 8px 8px 0 0; font-size: 0.88rem; font-weight: 600; cursor: pointer; background: #1a1a2e; border: 1px solid #2e2e4e; border-bottom: none; color: #888; transition: all 0.15s; }
  .tab.active { background: #1e1e3a; color: #a78bfa; border-color: #4a3a8e; }
  .tab:hover:not(.active) { color: #ccc; }

  /* CONTENT */
  .content { background: #1e1e3a; border: 1px solid #4a3a8e; border-radius: 0 12px 12px 12px; margin: 0 24px 24px; padding: 20px; }
  .panel { display: none; }
  .panel.active { display: block; }

  /* SEARCH BAR */
  .search-row { display: flex; gap: 10px; margin-bottom: 16px; }
  .search-wrap { position: relative; flex: 1; }
  .search-wrap input {
    width: 100%; background: #0f0f1a; border: 1px solid #3a3a5e; border-radius: 8px;
    color: #e0e0e0; padding: 10px 14px 10px 38px; font-size: 0.88rem; outline: none; transition: border 0.2s;
  }
  .search-wrap input:focus { border-color: #7c6af7; }
  .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #666; font-size: 1rem; pointer-events: none; }
  .btn { padding: 10px 18px; border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
  .btn-refresh { background: #2b3a5e; color: #7eb8f7; }
  .btn-refresh:hover { opacity: 0.8; }

  /* TABLE */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
  thead tr { background: #0f0f1a; }
  th { padding: 10px 14px; text-align: left; color: #888; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
  td { padding: 10px 14px; border-bottom: 1px solid #1a1a2e; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #1a1a2e; }
  .jobid-code { font-family: monospace; font-size: 0.8rem; color: #7eb8f7; cursor: pointer; }
  .jobid-code:hover { color: #a78bfa; text-decoration: underline; }
  .jobid-full { display: none; }
  .age-badge {
    display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;
  }
  .age-fresh { background: #1a3a1a; color: #68d391; border: 1px solid #38a169; }
  .age-mid   { background: #3a3a1a; color: #f6e05e; border: 1px solid #d69e2e; }
  .age-old   { background: #3a1a1a; color: #fc8181; border: 1px solid #e53e3e; }
  .tag { display: inline-block; background: #2a1a4e; border: 1px solid #5a3a9e; color: #c0a0ff; border-radius: 6px; padding: 1px 8px; font-size: 0.75rem; margin: 1px; }
  .empty { text-align: center; color: #555; padding: 40px; font-size: 0.9rem; }
  .count-badge { display: inline-block; background: #2a2a4e; border-radius: 10px; padding: 2px 10px; font-size: 0.78rem; color: #a78bfa; margin-left: 8px; }

  /* COPY TOAST */
  .toast { position: fixed; bottom: 24px; right: 24px; background: #2a3a2a; border: 1px solid #38a169; color: #68d391; padding: 10px 18px; border-radius: 8px; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 999; }
  .toast.show { opacity: 1; }

  /* SPINNER */
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #fff3; border-top-color: #a78bfa; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* SERVER PANEL GRID */
  .server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .server-card { background: #0f0f1a; border: 1px solid #2e2e4e; border-radius: 10px; padding: 14px; }
  .server-card .jobid { font-family: monospace; font-size: 0.78rem; color: #7eb8f7; margin-bottom: 8px; word-break: break-all; }
  .server-card .meta { font-size: 0.78rem; color: #888; display: flex; flex-direction: column; gap: 3px; }
  .server-card .meta b { color: #ccc; }
  .boss-badge { background: #3a1a00; border: 1px solid #d97706; color: #fbbf24; border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; display: inline-block; margin-top: 6px; }
  .rift-badge { background: #1a003a; border: 1px solid #7c3aed; color: #c4b5fd; border-radius: 6px; padding: 2px 8px; font-size: 0.75rem; display: inline-block; margin-top: 6px; }

  @media (max-width: 600px) {
    .header { flex-direction: column; gap: 10px; align-items: flex-start; }
    .tabs { padding: 12px 12px 0; overflow-x: auto; }
    .content { margin: 0 12px 16px; padding: 14px; }
    .search-row { flex-wrap: wrap; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>⚔️ Asura Dashboard</h1>
  <div class="stats-bar" id="header-stats">
    <div class="stat-pill">Players: <span id="h-players">-</span></div>
    <div class="stat-pill">Gangs: <span id="h-gangs">-</span></div>
    <div class="stat-pill">Servers: <span id="h-servers">-</span></div>
    <div class="stat-pill">Queue: <span id="h-queue">-</span></div>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('players')">👤 Players <span class="count-badge" id="tab-players">0</span></div>
  <div class="tab" onclick="switchTab('gangs')">🏴 Gangs <span class="count-badge" id="tab-gangs">0</span></div>
  <div class="tab" onclick="switchTab('servers')">🖥️ Servers <span class="count-badge" id="tab-servers">0</span></div>
</div>

<div class="content">

  <!-- PLAYERS PANEL -->
  <div class="panel active" id="panel-players">
    <div class="search-row">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="search-player" placeholder="Tìm player theo tên..." oninput="filterPlayers()" autocomplete="off">
      </div>
      <button class="btn btn-refresh" onclick="loadPlayers()">↻ Refresh</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Tên Player</th><th>JobId</th><th>Cập nhật</th></tr></thead>
        <tbody id="players-body"></tbody>
      </table>
      <div class="empty" id="players-empty" style="display:none">Không tìm thấy player nào</div>
    </div>
  </div>

  <!-- GANGS PANEL -->
  <div class="panel" id="panel-gangs">
    <div class="search-row">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="search-gang" placeholder="Tìm gang theo tên..." oninput="filterGangs()" autocomplete="off">
      </div>
      <button class="btn btn-refresh" onclick="loadGangs()">↻ Refresh</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Tên Gang</th><th>Số Server</th><th>JobIds</th><th>Mới nhất</th></tr></thead>
        <tbody id="gangs-body"></tbody>
      </table>
      <div class="empty" id="gangs-empty" style="display:none">Không tìm thấy gang nào</div>
    </div>
  </div>

  <!-- SERVERS PANEL -->
  <div class="panel" id="panel-servers">
    <div class="search-row">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="search-server" placeholder="Tìm JobId server..." oninput="filterServers()" autocomplete="off">
      </div>
      <button class="btn btn-refresh" onclick="loadServers()">↻ Refresh</button>
    </div>
    <div class="server-grid" id="server-grid"></div>
    <div class="empty" id="servers-empty" style="display:none">Không có server nào trong database</div>
  </div>

</div>

<div class="toast" id="toast">✅ Đã copy JobId!</div>

<script>
let allPlayers = [];
let allGangs   = [];
let allServers = [];

// ─── TABS ───────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const tabs = ['players','gangs','servers'];
  document.querySelectorAll('.tab')[tabs.indexOf(name)].classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ─── TIME ────────────────────────────────────────────
function timeAgo(ts) {
  const s = Math.floor(Date.now()/1000) - ts;
  if (s < 60) return 'vừa xong';
  const m = Math.floor(s/60);
  if (m < 60) return m + ' phút trước';
  const h = Math.floor(m/60), rm = m%60;
  return h + 'h ' + rm + 'm trước';
}
function ageBadge(minutes) {
  const h = Math.floor(minutes/60), m = minutes%60;
  const label = h + 'h ' + m + 'm';
  if (minutes < 60*10) return '<span class="age-badge age-fresh">' + label + '</span>';
  if (minutes < 60*30) return '<span class="age-badge age-mid">'   + label + '</span>';
  return                      '<span class="age-badge age-old">'   + label + '</span>';
}
function calcAge(server) {
  const now = Math.floor(Date.now()/1000);
  return (server.ageAtScan || 0) + Math.floor((now - (server.timestamp || now)) / 60);
}

// ─── COPY JOBID ──────────────────────────────────────
function copyJobId(jobId) {
  navigator.clipboard.writeText(jobId).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = jobId; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}
function shortId(id) { return id.substring(0,8) + '...'; }

// ─── STATUS ──────────────────────────────────────────
async function loadHeaderStatus() {
  try {
    const r = await fetch('/status');
    const d = await r.json();
    document.getElementById('h-players').textContent = d.database.players;
    document.getElementById('h-gangs').textContent   = d.database.gangs;
    document.getElementById('h-servers').textContent = d.database.servers;
    document.getElementById('h-queue').textContent   = d.scanner.available;
  } catch(e) {}
}

// ─── PLAYERS ─────────────────────────────────────────
async function loadPlayers() {
  const body = document.getElementById('players-body');
  body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px"><span class="spinner"></span></td></tr>';
  try {
    const r = await fetch('/api/all-players');
    allPlayers = await r.json();
    document.getElementById('tab-players').textContent = allPlayers.length;
    renderPlayers(allPlayers);
    loadHeaderStatus();
  } catch(e) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Lỗi tải dữ liệu</td></tr>';
  }
}
function renderPlayers(list) {
  const body = document.getElementById('players-body');
  const empty = document.getElementById('players-empty');
  if (!list.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = list.map((p,i) => \`
    <tr>
      <td style="color:#555;width:40px">\${i+1}</td>
      <td><b style="color:#e0e0e0">\${escHtml(p.name)}</b></td>
      <td>
        <span class="jobid-code" title="Click để copy" onclick="copyJobId('\${p.jobId}')">
          \${shortId(p.jobId)}
        </span>
      </td>
      <td style="color:#888;font-size:0.8rem">\${timeAgo(p.timestamp)}</td>
    </tr>
  \`).join('');
}
function filterPlayers() {
  const q = document.getElementById('search-player').value.toLowerCase().trim();
  renderPlayers(q ? allPlayers.filter(p => p.name.toLowerCase().includes(q)) : allPlayers);
}

// ─── GANGS ───────────────────────────────────────────
async function loadGangs() {
  const body = document.getElementById('gangs-body');
  body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px"><span class="spinner"></span></td></tr>';
  try {
    const r = await fetch('/api/all-gangs');
    allGangs = await r.json();
    document.getElementById('tab-gangs').textContent = allGangs.length;
    renderGangs(allGangs);
    loadHeaderStatus();
  } catch(e) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Lỗi tải dữ liệu</td></tr>';
  }
}
function renderGangs(list) {
  const body = document.getElementById('gangs-body');
  const empty = document.getElementById('gangs-empty');
  if (!list.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = list.map((g,i) => \`
    <tr>
      <td style="color:#555;width:40px">\${i+1}</td>
      <td><b style="color:#e0e0e0">\${escHtml(g.name)}</b></td>
      <td><span style="color:#a78bfa;font-weight:700">\${g.servers.length}</span></td>
      <td>\${g.servers.slice(0,3).map(s =>
        \`<span class="tag" title="\${s.jobId}" onclick="copyJobId('\${s.jobId}')" style="cursor:pointer">\${shortId(s.jobId)}</span>\`
      ).join('')}\${g.servers.length > 3 ? '<span class="tag">+' + (g.servers.length-3) + ' nữa</span>' : ''}</td>
      <td style="color:#888;font-size:0.8rem">\${timeAgo(g.lastSeen)}</td>
    </tr>
  \`).join('');
}
function filterGangs() {
  const q = document.getElementById('search-gang').value.toLowerCase().trim();
  renderGangs(q ? allGangs.filter(g => g.name.toLowerCase().includes(q)) : allGangs);
}

// ─── SERVERS ─────────────────────────────────────────
async function loadServers() {
  const grid = document.getElementById('server-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px"><span class="spinner"></span></div>';
  try {
    const r = await fetch('/api/all-servers');
    allServers = await r.json();
    document.getElementById('tab-servers').textContent = allServers.length;
    renderServers(allServers);
    loadHeaderStatus();
  } catch(e) {
    grid.innerHTML = '<div class="empty">Lỗi tải dữ liệu</div>';
  }
}
function renderServers(list) {
  const grid = document.getElementById('server-grid');
  const empty = document.getElementById('servers-empty');
  if (!list.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = list.map(s => {
    const age = s.currentAge;
    const badges = (s.boss ? \`<div class="boss-badge">👹 Boss: \${s.boss}</div>\` : '') +
                   (s.rift ? \`<div class="rift-badge">🌀 Rift: \${s.rift}</div>\` : '');
    return \`
      <div class="server-card">
        <div class="jobid" title="Click để copy" onclick="copyJobId('\${s.jobId}')" style="cursor:pointer">\${s.jobId}</div>
        <div class="meta">
          <div>Tuổi server: <b>\${ageBadge(age)}</b></div>
          <div>Cập nhật: <b>\${timeAgo(s.timestamp)}</b></div>
        </div>
        \${badges}
      </div>
    \`;
  }).join('');
}
function filterServers() {
  const q = document.getElementById('search-server').value.toLowerCase().trim();
  renderServers(q ? allServers.filter(s => s.jobId.toLowerCase().includes(q)) : allServers);
}

// ─── UTILS ───────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── INIT ────────────────────────────────────────────
loadPlayers();
loadGangs();
loadServers();
loadHeaderStatus();
</script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(dashHtml);

    } else if (req.url === '/api/all-players' && req.method === 'GET') {
        // Trả về toàn bộ player list cho dashboard
        const players = Object.entries(db.players)
            .map(([name, data]) => ({ name, jobId: data.jobId, timestamp: data.timestamp }))
            .sort((a, b) => b.timestamp - a.timestamp);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(players));

    } else if (req.url === '/api/all-gangs' && req.method === 'GET') {
        // Trả về toàn bộ gang list cho dashboard
        const gangs = Object.entries(db.gangs).map(([name, servers]) => {
            const serverList = Object.entries(servers)
                .map(([jobId, timestamp]) => ({ jobId, timestamp }))
                .sort((a, b) => b.timestamp - a.timestamp);
            const lastSeen = serverList.length > 0 ? serverList[0].timestamp : 0;
            return { name, servers: serverList, lastSeen };
        }).sort((a, b) => b.lastSeen - a.lastSeen);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(gangs));

    } else if (req.url === '/api/all-servers' && req.method === 'GET') {
        // Trả về toàn bộ server list cho dashboard
        const now = Math.floor(Date.now() / 1000);
        const servers = Object.entries(db.servers).map(([jobId, data]) => ({
            jobId,
            timestamp: data.timestamp,
            ageAtScan: data.ageAtScan || 0,
            currentAge: (data.ageAtScan || 0) + Math.floor((now - (data.timestamp || now)) / 60),
            boss: data.boss || null,
            rift: data.rift || null
        })).sort((a, b) => b.timestamp - a.timestamp);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(servers));

    } else if (req.url === '/clear-jobid-queue' && req.method === 'POST') {
        // Clear jobid queue via website
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { password, type } = JSON.parse(body);
                const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'asura2024';

                if (password !== ADMIN_PASSWORD) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: false, error: 'Sai password!' }));
                    return;
                }

                let cleared = 0;
                jobIdScanner.loadData(); // Reload fresh data

                if (type === 'available') {
                    cleared = jobIdScanner.jobIdsQueue.available.length;
                    jobIdScanner.jobIdsQueue.available = [];
                } else if (type === 'scanning') {
                    cleared = jobIdScanner.jobIdsQueue.scanning.length;
                    jobIdScanner.jobIdsQueue.scanning = [];
                } else if (type === 'failed') {
                    cleared = jobIdScanner.jobIdsQueue.failed.length;
                    jobIdScanner.jobIdsQueue.failed = [];
                } else if (type === 'used') {
                    cleared = jobIdScanner.usedJobIds.size;
                    jobIdScanner.usedJobIds = new Set();
                } else if (type === 'all-queues') {
                    cleared = jobIdScanner.jobIdsQueue.available.length
                            + jobIdScanner.jobIdsQueue.scanning.length
                            + jobIdScanner.jobIdsQueue.failed.length
                            + jobIdScanner.usedJobIds.size;
                    jobIdScanner.jobIdsQueue = { available: [], scanning: [], failed: [] };
                    jobIdScanner.usedJobIds = new Set();
                } else {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: false, error: 'Loại xóa không hợp lệ' }));
                    return;
                }

                jobIdScanner.saveData();
                console.log(`\n[WEB] Clear jobid queue (${type}): ${cleared} items removed`);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, type, cleared }));
            } catch (e) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });

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