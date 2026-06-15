const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ==========================================
// CONFIG
// ==========================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    BRAIN_URL: process.env.BRAIN_URL || 'http://localhost:3000',
    FISHSTRAP_BASE: 'https://www.fishstrap.app/v1/joingame?placeId=13358463560&gameInstanceId=',
    ADMIN_USER_IDS: (process.env.ADMIN_USER_IDS || '123456789012345678').split(','),
};

// ==========================================
// USAGE LOGGING SYSTEM
// ==========================================
class UsageLogger {
    constructor() {
        this.logFile = path.join(__dirname, 'usage_logs.json');
        this.loadLogs();
    }

    loadLogs() {
        if (fs.existsSync(this.logFile)) {
            try {
                this.logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
            } catch (e) {
                this.logs = [];
            }
        } else {
            this.logs = [];
        }
    }

    saveLogs() {
        // Keep only last 1000 logs to prevent file getting too large
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-1000);
        }
        fs.writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2));
    }

    // Log command usage with results
    logUsage(userId, username, command, result, details = null) {
        const logEntry = {
            timestamp: Date.now(),
            userId: userId,
            username: username,
            command: command,
            result: result, // 'success', 'not_found', 'error'
            details: details, // Additional info like player name found, gang name, etc.
            date: new Date().toLocaleString('vi-VN')
        };

        this.logs.push(logEntry);
        this.saveLogs();

        // Also log to console for real-time monitoring
        console.log(`[USAGE] ${username} (${userId}) used /${command}: ${result}${details ? ` - ${JSON.stringify(details)}` : ''}`);
    }

    // Get recent logs
    getRecentLogs(limit = 50, command = null) {
        let filteredLogs = this.logs;
        
        if (command) {
            filteredLogs = this.logs.filter(log => log.command === command);
        }

        return filteredLogs
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    // Get stats
    getStats() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * oneHour;

        const recentLogs = this.logs.filter(log => now - log.timestamp < oneDay);
        const hourlyLogs = this.logs.filter(log => now - log.timestamp < oneHour);

        const commandStats = {};
        recentLogs.forEach(log => {
            if (!commandStats[log.command]) {
                commandStats[log.command] = { total: 0, success: 0, failed: 0 };
            }
            commandStats[log.command].total++;
            if (log.result === 'success') {
                commandStats[log.command].success++;
            } else {
                commandStats[log.command].failed++;
            }
        });

        return {
            totalLogs: this.logs.length,
            last24h: recentLogs.length,
            lastHour: hourlyLogs.length,
            commandStats
        };
    }
}
class KeySystem {
    constructor() {
        this.keyFile = path.join(__dirname, 'keys.json');
        this.usageFile = path.join(__dirname, 'usage.json');
        this.loadData();
    }

    loadData() {
        // Load keys
        if (fs.existsSync(this.keyFile)) {
            try {
                this.keys = JSON.parse(fs.readFileSync(this.keyFile, 'utf8'));
            } catch (e) {
                this.keys = {};
            }
        } else {
            this.keys = {};
        }

        // Load usage tracking
        if (fs.existsSync(this.usageFile)) {
            try {
                this.usage = JSON.parse(fs.readFileSync(this.usageFile, 'utf8'));
            } catch (e) {
                this.usage = {};
            }
        } else {
            this.usage = {};
        }
    }

    saveData() {
        fs.writeFileSync(this.keyFile, JSON.stringify(this.keys, null, 2));
        fs.writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2));
    }

    // Tạo key mới
    createKey(type, params) {
        const keyId = 'key_' + Math.random().toString(36).substr(2, 12);
        const now = Date.now();
        
        const keyData = {
            id: keyId,
            type: type, // 'usage' hoặc 'time'
            created: now,
            createdBy: params.adminId,
            ...params
        };

        this.keys[keyId] = keyData;
        this.saveData();
        return keyData;
    }

    // Kiểm tra key có hợp lệ không
    validateKey(keyId, userId) {
        const key = this.keys[keyId];
        if (!key) return { valid: false, reason: 'Key không tồn tại' };

        const now = Date.now();

        // Check if key expired (time-based)
        if (key.type === 'time' && key.expiresAt && now > key.expiresAt) {
            return { valid: false, reason: 'Key đã hết hạn' };
        }

        // Check usage limit
        if (key.type === 'usage') {
            const userUsage = this.getUserKeyUsage(keyId, userId);
            if (userUsage >= key.maxUsage) {
                return { valid: false, reason: 'Đã hết lượt sử dụng' };
            }
        }

        // Check per-user usage limit (NEW FEATURE)
        if (key.userUsageLimit && key.userUsageLimit > 0) {
            const userUsage = this.getUserKeyUsage(keyId, userId);
            if (userUsage >= key.userUsageLimit) {
                return { valid: false, reason: `Bạn đã hết ${key.userUsageLimit} lượt sử dụng key này` };
            }
        }

        // Check concurrent users limit
        if (key.maxUsers) {
            const currentUsers = this.getKeyActiveUsers(keyId);
            if (currentUsers.length >= key.maxUsers && !currentUsers.includes(userId)) {
                return { valid: false, reason: 'Key đã đạt giới hạn người dùng' };
            }
        }

        return { valid: true, key: key };
    }

    // Sử dụng key (trừ lượt/ghi nhận usage)
    useKey(keyId, userId, command) {
        if (!this.usage[keyId]) this.usage[keyId] = {};
        if (!this.usage[keyId][userId]) {
            this.usage[keyId][userId] = {
                count: 0,
                lastUsed: 0,
                commands: []
            };
        }

        this.usage[keyId][userId].count++;
        this.usage[keyId][userId].lastUsed = Date.now();
        this.usage[keyId][userId].commands.push({
            command: command,
            timestamp: Date.now()
        });

        this.saveData();
    }

    // Lấy usage của user cho key
    getUserKeyUsage(keyId, userId) {
        return this.usage[keyId]?.[userId]?.count || 0;
    }

    // Lấy danh sách user đang active với key
    getKeyActiveUsers(keyId) {
        if (!this.usage[keyId]) return [];
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        return Object.keys(this.usage[keyId]).filter(userId => 
            this.usage[keyId][userId].lastUsed > oneDayAgo
        );
    }

    // Lấy thống kê key
    getKeyStats(keyId) {
        const key = this.keys[keyId];
        if (!key) return null;

        const usage = this.usage[keyId] || {};
        const totalUsage = Object.values(usage).reduce((sum, user) => sum + user.count, 0);
        const activeUsers = this.getKeyActiveUsers(keyId);

        return {
            ...key,
            totalUsage,
            activeUsers: activeUsers.length,
            userCount: Object.keys(usage).length,
            usageDetails: usage
        };
    }

    // Get usage logs for admin
    getUsageLogs(keyId = null, limit = 20) {
        const logs = [];
        const keysToCheck = keyId ? [keyId] : Object.keys(this.usage);
        
        for (const kid of keysToCheck) {
            const keyUsage = this.usage[kid];
            if (!keyUsage) continue;
            
            for (const [userId, userData] of Object.entries(keyUsage)) {
                for (const cmd of userData.commands || []) {
                    logs.push({
                        keyId: kid,
                        userId: userId,
                        command: cmd.command,
                        timestamp: cmd.timestamp
                    });
                }
            }
        }
        
        // Sort by timestamp descending and limit
        return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }
}

// ==========================================
// DATABASE ACCESS
// ==========================================
class DatabaseAPI {
    constructor(brainUrl) {
        this.brainUrl = brainUrl;
    }

    async getBrainData() {
        try {
            const response = await axios.get(`${this.brainUrl}/status`);
            return response.data;
        } catch (error) {
            console.error('Lỗi kết nối Brain Central:', error.message);
            return null;
        }
    }

    // Tìm player theo tên
    async findPlayer(playerName) {
        try {
            // Đọc database từ file (fallback method)
            const dbPath = path.join(__dirname, '../rift_database.json');
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const players = db.players || {};
                
                // Tìm exact match hoặc partial match
                for (const [name, data] of Object.entries(players)) {
                    if (name.toLowerCase().includes(playerName.toLowerCase())) {
                        return { name, ...data };
                    }
                }
            }
            return null;
        } catch (error) {
            console.error('Lỗi tìm player:', error.message);
            return null;
        }
    }

    // Tìm gang theo tên
    async findGangs(gangName) {
        try {
            const dbPath = path.join(__dirname, '../rift_database.json');
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const gangs = db.gangs || {};
                
                const matches = [];
                for (const [name, data] of Object.entries(gangs)) {
                    if (name.toLowerCase().includes(gangName.toLowerCase())) {
                        matches.push({ name, ...data });
                    }
                }
                return matches;
            }
            return [];
        } catch (error) {
            console.error('Lỗi tìm gang:', error.message);
            return [];
        }
    }

    // Tìm server theo điều kiện Boss
    async findBossServers() {
        try {
            const dbPath = path.join(__dirname, '../rift_database.json');
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const servers = db.servers || {};
                
                const bossServers = [];
                const now = Math.floor(Date.now() / 1000);
                
                for (const [jobId, data] of Object.entries(servers)) {
                    const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
                    const h = Math.floor(currentAge / 60);
                    const m = currentAge % 60;
                    
                    // Boss logic: spawn tại h lẻ, phút 55
                    let timeToBoss = 0;
                    if (h % 2 === 0) {
                        // Giờ chẵn -> boss ở giờ tiếp theo phút 55
                        timeToBoss = (60 - m) + 55;
                    } else {
                        // Giờ lẻ -> boss ở phút 55
                        timeToBoss = 55 - m;
                        if (timeToBoss < 0) timeToBoss += 120; // Next cycle
                    }
                    
                    // Chỉ lấy server trong khoảng ±10 phút
                    if (Math.abs(timeToBoss) <= 10 || (timeToBoss >= 110 && timeToBoss <= 130)) {
                        bossServers.push({
                            jobId,
                            currentAge,
                            timeToBoss: timeToBoss > 60 ? timeToBoss - 120 : timeToBoss,
                            status: timeToBoss <= 0 ? 'spawned' : 'coming'
                        });
                    }
                }
                
                return bossServers.sort((a, b) => Math.abs(a.timeToBoss) - Math.abs(b.timeToBoss));
            }
            return [];
        } catch (error) {
            console.error('Lỗi tìm boss servers:', error.message);
            return [];
        }
    }

    // Tìm server theo điều kiện Rift
    async findRiftServers() {
        try {
            const dbPath = path.join(__dirname, '../rift_database.json');
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                const servers = db.servers || {};
                
                const riftServers = [];
                const now = Math.floor(Date.now() / 1000);
                
                for (const [jobId, data] of Object.entries(servers)) {
                    const currentAge = data.ageAtScan + Math.floor((now - data.timestamp) / 60);
                    
                    // Rift logic: spawn mỗi 90 phút
                    const cycle = Math.floor((currentAge + 10) / 90);
                    if (cycle > 0) {
                        const spawnTime = cycle * 90;
                        const timeToRift = spawnTime - currentAge;
                        
                        // Chỉ lấy server trong khoảng ±10 phút
                        if (Math.abs(timeToRift) <= 10) {
                            riftServers.push({
                                jobId,
                                currentAge,
                                timeToRift,
                                status: timeToRift <= 0 ? 'spawned' : 'coming'
                            });
                        }
                    }
                }
                
                return riftServers.sort((a, b) => Math.abs(a.timeToRift) - Math.abs(b.timeToRift));
            }
            return [];
        } catch (error) {
            console.error('Lỗi tìm rift servers:', error.message);
            return [];
        }
    }
}

// ==========================================
// BOT SETUP
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const keySystem = new KeySystem();
const usageLogger = new UsageLogger();
const dbAPI = new DatabaseAPI(CONFIG.BRAIN_URL);

// Utility functions
function formatTimeAgo(timestamp) {
    const secs = Math.floor(Date.now() / 1000) - timestamp;
    if (secs < 60) return 'vừa xong';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours} giờ ${remainMins} phút trước`;
}

function isAdmin(userId) {
    return CONFIG.ADMIN_USER_IDS.includes(userId);
}

// ==========================================
// SLASH COMMANDS
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('username')
        .setDescription('Tìm kiếm player trong database')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('Tên player cần tìm')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key để sử dụng lệnh')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('gang')
        .setDescription('Tìm kiếm gang trong database')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Tên gang cần tìm')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key để sử dụng lệnh')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('boss')
        .setDescription('Tìm server có Boss sắp spawn')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key để sử dụng lệnh')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('rift')
        .setDescription('Tìm server có Rift sắp spawn')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key để sử dụng lệnh')
                .setRequired(true)),

    // Admin commands
    new SlashCommandBuilder()
        .setName('createkey')
        .setDescription('[ADMIN] Tạo key mới')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại key')
                .setRequired(true)
                .addChoices(
                    { name: 'Theo số lần sử dụng', value: 'usage' },
                    { name: 'Theo thời gian', value: 'time' }
                ))
        .addIntegerOption(option =>
            option.setName('value')
                .setDescription('Số lượt (usage) hoặc giờ (time)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('maxusers')
                .setDescription('Số người tối đa có thể dùng key')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('usagelimit')
                .setDescription('Giới hạn lượt mỗi user (0 = không giới hạn)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('logs')
        .setDescription('[ADMIN] Xem logs sử dụng lệnh')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Lệnh cụ thể (username/gang/boss/rift)')
                .setRequired(false)
                .addChoices(
                    { name: 'Username', value: 'username' },
                    { name: 'Gang', value: 'gang' },
                    { name: 'Boss', value: 'boss' },
                    { name: 'Rift', value: 'rift' }
                ))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Số logs tối đa (default: 30)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('[ADMIN] Xem thống kê sử dụng bot'),

    new SlashCommandBuilder()
        .setName('keyusage')
        .setDescription('Xem usage của key hiện tại')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key để kiểm tra usage')
                .setRequired(true))
];

// ==========================================
// COMMAND HANDLERS
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const userId = interaction.user.id;

    // Admin commands
    if (['createkey', 'keyinfo', 'logs', 'stats'].includes(commandName)) {
        if (!isAdmin(userId)) {
            return interaction.reply({ content: '❌ Chỉ admin mới có thể sử dụng lệnh này!', ephemeral: true });
        }

        if (commandName === 'createkey') {
            const type = interaction.options.getString('type');
            const value = interaction.options.getInteger('value');
            const maxUsers = interaction.options.getInteger('maxusers') || 1;
            const userUsageLimit = interaction.options.getInteger('usagelimit') || 0;

            let keyParams = {
                adminId: userId,
                maxUsers: maxUsers,
                userUsageLimit: userUsageLimit // NEW: Per-user limit
            };

            if (type === 'usage') {
                keyParams.maxUsage = value;
            } else if (type === 'time') {
                keyParams.expiresAt = Date.now() + (value * 60 * 60 * 1000); // Convert hours to ms
            }

            const newKey = keySystem.createKey(type, keyParams);

            const embed = new EmbedBuilder()
                .setTitle('🔑 Key Mới Được Tạo')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Key ID', value: `\`${newKey.id}\``, inline: false },
                    { name: 'Loại', value: type === 'usage' ? 'Theo lượt sử dụng' : 'Theo thời gian', inline: true },
                    { name: 'Giá trị', value: type === 'usage' ? `${value} lượt` : `${value} giờ`, inline: true },
                    { name: 'Tối đa người dùng', value: maxUsers.toString(), inline: true }
                );

            if (userUsageLimit > 0) {
                embed.addFields({ name: 'Giới hạn mỗi user', value: `${userUsageLimit} lượt/người`, inline: true });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'keyinfo') {
            const keyId = interaction.options.getString('keyid');
            const stats = keySystem.getKeyStats(keyId);

            if (!stats) {
                return interaction.reply({ content: '❌ Key không tồn tại!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Thông Tin Key')
                .setColor(0x0099ff)
                .addFields(
                    { name: 'Key ID', value: `\`${stats.id}\``, inline: false },
                    { name: 'Loại', value: stats.type === 'usage' ? 'Theo lượt' : 'Theo thời gian', inline: true },
                    { name: 'Tổng sử dụng', value: stats.totalUsage.toString(), inline: true },
                    { name: 'Người dùng active', value: `${stats.activeUsers}/${stats.maxUsers || '∞'}`, inline: true },
                    { name: 'Tạo lúc', value: new Date(stats.created).toLocaleString('vi-VN'), inline: false }
                );

            if (stats.expiresAt) {
                embed.addFields({ name: 'Hết hạn', value: new Date(stats.expiresAt).toLocaleString('vi-VN'), inline: true });
            }
            if (stats.maxUsage) {
                embed.addFields({ name: 'Giới hạn tổng', value: stats.maxUsage.toString(), inline: true });
            }
            if (stats.userUsageLimit) {
                embed.addFields({ name: 'Giới hạn mỗi user', value: `${stats.userUsageLimit} lượt`, inline: true });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'logs') {
            const command = interaction.options.getString('command');
            const limit = interaction.options.getInteger('limit') || 30;
            
            const logs = usageLogger.getRecentLogs(limit, command);
            
            if (logs.length === 0) {
                return interaction.reply({ content: '❌ Không có logs nào.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 Usage Logs')
                .setColor(0xffaa00)
                .setDescription(`${logs.length} logs gần đây${command ? ` cho lệnh **${command}**` : ''}:`);

            const logText = logs.map(log => {
                const date = new Date(log.timestamp).toLocaleString('vi-VN', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit'
                });
                
                let resultIcon = '✅';
                if (log.result === 'not_found') resultIcon = '❌';
                if (log.result === 'error') resultIcon = '⚠️';
                
                let detailText = '';
                if (log.details) {
                    if (log.details.playerName) detailText = ` → **${log.details.playerName}**`;
                    if (log.details.gangName) detailText = ` → **${log.details.gangName}**`;
                    if (log.details.serverCount) detailText = ` → **${log.details.serverCount}** servers`;
                    if (log.details.error) detailText = ` → ${log.details.error}`;
                }
                
                return `\`${date}\` ${resultIcon} **${log.command}** - ${log.username}${detailText}`;
            }).join('\n');

            // Split into chunks if too long
            if (logText.length > 4000) {
                embed.addFields({ 
                    name: 'Logs', 
                    value: logText.substring(0, 4000) + '\n...(truncated)', 
                    inline: false 
                });
            } else {
                embed.addFields({ name: 'Logs', value: logText || 'Không có logs', inline: false });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'stats') {
            const stats = usageLogger.getStats();
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Bot Usage Stats')
                .setColor(0x00ff99)
                .addFields(
                    { name: 'Total Logs', value: stats.totalLogs.toString(), inline: true },
                    { name: 'Last 24h', value: stats.last24h.toString(), inline: true },
                    { name: 'Last Hour', value: stats.lastHour.toString(), inline: true }
                );

            if (Object.keys(stats.commandStats).length > 0) {
                const commandText = Object.entries(stats.commandStats)
                    .map(([cmd, data]) => `**${cmd}**: ${data.total} (✅${data.success} ❌${data.failed})`)
                    .join('\n');
                embed.addFields({ name: 'Commands (24h)', value: commandText, inline: false });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // User command: check key usage
    if (commandName === 'keyusage') {
        const keyId = interaction.options.getString('key');
        const userUsage = keySystem.getUserKeyUsage(keyId, userId);
        const keyStats = keySystem.getKeyStats(keyId);
        
        if (!keyStats) {
            return interaction.reply({ content: '❌ Key không tồn tại!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Key Usage')
            .setColor(0x00aaff)
            .addFields(
                { name: 'Key ID', value: `\`${keyId}\``, inline: false },
                { name: 'Bạn đã sử dụng', value: `${userUsage} lần`, inline: true }
            );

        if (keyStats.userUsageLimit && keyStats.userUsageLimit > 0) {
            embed.addFields({ 
                name: 'Giới hạn của bạn', 
                value: `${keyStats.userUsageLimit} lần`, 
                inline: true 
            });
            embed.addFields({ 
                name: 'Còn lại', 
                value: `${Math.max(0, keyStats.userUsageLimit - userUsage)} lần`, 
                inline: true 
            });
        }

        if (keyStats.maxUsage) {
            embed.addFields({ 
                name: 'Tổng đã sử dụng', 
                value: `${keyStats.totalUsage}/${keyStats.maxUsage} lần`, 
                inline: true 
            });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // User commands (require key)
    const keyId = interaction.options.getString('key');
    if (!keyId) {
        return interaction.reply({ content: '❌ Thiếu key!', ephemeral: true });
    }

    const keyValidation = keySystem.validateKey(keyId, userId);
    if (!keyValidation.valid) {
        return interaction.reply({ content: `❌ Key không hợp lệ: ${keyValidation.reason}`, ephemeral: true });
    }

    // Use the key
    keySystem.useKey(keyId, userId, commandName);

    try {
        if (commandName === 'username') {
            const playerName = interaction.options.getString('player');
            const playerData = await dbAPI.findPlayer(playerName);

            if (!playerData) {
                // Log failed search
                usageLogger.logUsage(
                    userId, 
                    interaction.user.username, 
                    'username', 
                    'not_found',
                    { searchedPlayer: playerName }
                );
                
                return interaction.reply({ content: `❌ Không tìm thấy username \`${playerName}\``, ephemeral: true });
            }

            const joinUrl = CONFIG.FISHSTRAP_BASE + playerData.jobId;
            const timeAgo = formatTimeAgo(playerData.timestamp);

            // Log successful search
            usageLogger.logUsage(
                userId, 
                interaction.user.username, 
                'username', 
                'success',
                { playerName: playerData.name, timeAgo: timeAgo }
            );

            const embed = new EmbedBuilder()
                .setTitle('👤 Player Tìm Thấy')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Tên Player', value: playerData.name, inline: true },
                    { name: 'Thời gian tìm thấy', value: timeAgo, inline: true },
                    { name: 'Join Link', value: `[Click để join](${joinUrl})`, inline: false }
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'gang') {
            const gangName = interaction.options.getString('name');
            const gangs = await dbAPI.findGangs(gangName);

            if (gangs.length === 0) {
                // Log failed search
                usageLogger.logUsage(
                    userId, 
                    interaction.user.username, 
                    'gang', 
                    'not_found',
                    { searchedGang: gangName }
                );
                
                return interaction.reply({ content: `❌ Không tìm thấy gang hoặc sai tên gang \`${gangName}\``, ephemeral: true });
            }

            // Log successful search
            usageLogger.logUsage(
                userId, 
                interaction.user.username, 
                'gang', 
                'success',
                { 
                    searchedGang: gangName,
                    foundCount: gangs.length,
                    gangs: gangs.map(g => g.name)
                }
            );

            const embed = new EmbedBuilder()
                .setTitle('🏴 Gang Tìm Thấy')
                .setColor(0xff6600);

            gangs.slice(0, 10).forEach(gang => { // Limit to 10 results
                const joinUrl = CONFIG.FISHSTRAP_BASE + gang.jobId;
                const timeAgo = formatTimeAgo(gang.timestamp);
                embed.addFields({
                    name: gang.name,
                    value: `[Join Server](${joinUrl}) - ${timeAgo}`,
                    inline: false
                });
            });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'boss') {
            const bossServers = await dbAPI.findBossServers();

            if (bossServers.length === 0) {
                // Log failed search
                usageLogger.logUsage(
                    userId, 
                    interaction.user.username, 
                    'boss', 
                    'not_found',
                    { reason: 'no_servers_found' }
                );
                
                return interaction.reply({ content: '❌ Không tìm thấy server nào gần mốc Boss.', ephemeral: true });
            }

            // Log successful search
            usageLogger.logUsage(
                userId, 
                interaction.user.username, 
                'boss', 
                'success',
                { serverCount: bossServers.length }
            );

            const embed = new EmbedBuilder()
                .setTitle('🔥 Boss Servers')
                .setColor(0xff0000);

            bossServers.slice(0, 5).forEach(server => {
                const joinUrl = CONFIG.FISHSTRAP_BASE + server.jobId;
                const status = server.timeToBoss <= 0 
                    ? `đã xuất hiện Boss ${Math.abs(server.timeToBoss)} phút trước`
                    : `còn ${server.timeToBoss} phút sẽ xuất hiện Boss`;
                
                embed.addFields({
                    name: `Server (Age: ${Math.floor(server.currentAge/60)}h${server.currentAge%60}m)`,
                    value: `[Join Server](${joinUrl})\n${status}`,
                    inline: false
                });
            });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'rift') {
            const riftServers = await dbAPI.findRiftServers();

            if (riftServers.length === 0) {
                // Log failed search
                usageLogger.logUsage(
                    userId, 
                    interaction.user.username, 
                    'rift', 
                    'not_found',
                    { reason: 'no_servers_found' }
                );
                
                return interaction.reply({ content: '❌ Không tìm thấy server nào gần mốc Rift.', ephemeral: true });
            }

            // Log successful search
            usageLogger.logUsage(
                userId, 
                interaction.user.username, 
                'rift', 
                'success',
                { serverCount: riftServers.length }
            );

            const embed = new EmbedBuilder()
                .setTitle('🌀 Rift Servers')
                .setColor(0x9900ff);

            riftServers.slice(0, 5).forEach(server => {
                const joinUrl = CONFIG.FISHSTRAP_BASE + server.jobId;
                const status = server.timeToRift <= 0 
                    ? `đã xuất hiện Rift ${Math.abs(server.timeToRift)} phút trước`
                    : `còn ${server.timeToRift} phút sẽ xuất hiện Rift`;
                
                embed.addFields({
                    name: `Server (Age: ${Math.floor(server.currentAge/60)}h${server.currentAge%60}m)`,
                    value: `[Join Server](${joinUrl})\n${status}`,
                    inline: false
                });
            });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

    } catch (error) {
        console.error('Lỗi xử lý command:', error);
        return interaction.reply({ content: '❌ Có lỗi xảy ra khi xử lý lệnh.', ephemeral: true });
    }
});

// ==========================================
// BOT STARTUP
// ==========================================
client.once('ready', async () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
    
    // Register slash commands
    try {
        console.log('📝 Đang đăng ký slash commands...');
        await client.application.commands.set(commands);
        console.log('✅ Slash commands đã được đăng ký thành công!');
    } catch (error) {
        console.error('❌ Lỗi đăng ký commands:', error);
    }
});

client.login(CONFIG.TOKEN);