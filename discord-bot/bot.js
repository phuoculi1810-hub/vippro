const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Fallback for fetch in older Node.js versions
let fetch;
try {
    fetch = globalThis.fetch;
    if (!fetch) {
        const nodeFetch = require('node-fetch');
        fetch = nodeFetch;
    }
} catch (error) {
    console.warn('⚠️ Fetch không khả dụng, một số tính năng có thể không hoạt động');
}

// ==========================================
// CONFIG - SECURE VERSION
// ==========================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    BRAIN_URL: process.env.BRAIN_URL || 'https://vippro-production-0683.up.railway.app',
    FISHSTRAP_BASE: 'https://www.fishstrap.app/v1/joingame?placeId=13358463560&gameInstanceId=',
    ADMIN_USER_IDS: (process.env.ADMIN_USER_IDS || '').split(',').filter(id => id.length > 0),
};

// Security check
if (!CONFIG.TOKEN) {
    console.error('✅DISCORD_TOKEN không được thiết lập trong environment variables!');
    console.error('💡 Thêm DISCORD_TOKEN vào Railway Variables hoặc .env file');
    process.exit(1);
}

if (CONFIG.ADMIN_USER_IDS.length === 0) {
    console.error('✅ADMIN_USER_IDS không được thiết lập trong environment variables!');
    console.error('💡 Thêm Discord User ID của bạn vào ADMIN_USER_IDS trong Railway Variables');
    process.exit(1);
}

// ==========================================
// KEY SYSTEM CLASS
// ==========================================
class KeySystem {
    constructor() {
        this.keysFile = path.join(__dirname, 'keys.json');
        this.keys = this.loadKeys();
    }

    loadKeys() {
        try {
            if (fs.existsSync(this.keysFile)) {
                return JSON.parse(fs.readFileSync(this.keysFile, 'utf8'));
            }
        } catch (error) {
            console.error('✅Lỗi khi load keys:', error);
        }
        return {};
    }

    saveKeys() {
        try {
            fs.writeFileSync(this.keysFile, JSON.stringify(this.keys, null, 2));
        } catch (error) {
            console.error('✅Lỗi khi lưu keys:', error);
        }
    }

    createKey(type, value, maxUsers = null, usageLimit = null) {
        const keyId = 'key_' + Math.random().toString(36).substring(2, 12);
        const expireTime = type === 'time' ? Date.now() + (value * 60 * 60 * 1000) : null;
        
        this.keys[keyId] = {
            type: type,
            value: value,
            used: 0,
            created: Date.now(),
            expire: expireTime,
            maxUsers: maxUsers,
            usageLimit: usageLimit,
            userUsage: {}
        };
        
        this.saveKeys();
        return keyId;
    }

    isValidKey(keyId, userId) {
        const key = this.keys[keyId];
        if (!key) return { valid: false, reason: 'Key không tồn tại' };
        
        // Check expiration
        if (key.expire && Date.now() > key.expire) {
            return { valid: false, reason: 'Key đã hết hạn' };
        }
        
        // Check usage limit
        if (key.type === 'usage' && key.used >= key.value) {
            return { valid: false, reason: 'Key đã hết lượt sử dụng' };
        }
        
        // Check max users
        if (key.maxUsers) {
            const uniqueUsers = Object.keys(key.userUsage).length;
            if (uniqueUsers >= key.maxUsers && !key.userUsage[userId]) {
                return { valid: false, reason: `Key cho phép ${key.maxUsers} người dùng` };
            }
        }
        
        // Check per-user usage limit
        if (key.usageLimit && key.userUsage[userId] >= key.usageLimit) {
            return { valid: false, reason: `Bạn đã đạt giới hạn ${key.usageLimit} lượt cho key này` };
        }
        
        return { valid: true };
    }

    useKey(keyId, userId) {
        const validation = this.isValidKey(keyId, userId);
        if (!validation.valid) return validation;
        
        this.keys[keyId].used++;
        if (!this.keys[keyId].userUsage[userId]) {
            this.keys[keyId].userUsage[userId] = 0;
        }
        this.keys[keyId].userUsage[userId]++;
        
        this.saveKeys();
        return { valid: true };
    }

    getKeyInfo(keyId) {
        const key = this.keys[keyId];
        if (!key) return null;
        
        const uniqueUsers = Object.keys(key.userUsage).length;
        return {
            ...key,
            uniqueUsers: uniqueUsers,
            remaining: key.type === 'usage' ? (key.value - key.used) : null,
            timeLeft: key.expire ? Math.max(0, key.expire - Date.now()) : null
        };
    }
}

// ==========================================
// USAGE LOGGER CLASS
// ==========================================
class UsageLogger {
    constructor() {
        this.logsFile = path.join(__dirname, 'usage_logs.json');
        this.logs = this.loadLogs();
    }

    loadLogs() {
        try {
            if (fs.existsSync(this.logsFile)) {
                return JSON.parse(fs.readFileSync(this.logsFile, 'utf8'));
            }
        } catch (error) {
            console.error('✅Lỗi khi load logs:', error);
        }
        return [];
    }

    saveLogs() {
        try {
            // Keep only last 1000 logs
            if (this.logs.length > 1000) {
                this.logs = this.logs.slice(-1000);
            }
            fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2));
        } catch (error) {
            console.error('✅Lỗi khi lưu logs:', error);
        }
    }

    logUsage(userId, username, keyId, command, result) {
        this.logs.push({
            timestamp: Date.now(),
            userId: userId,
            username: username,
            keyId: keyId,
            command: command,
            result: result,
            success: result !== 'ERROR'
        });
        
        this.saveLogs();
    }

    getStats() {
        const totalCommands = this.logs.length;
        const uniqueUsers = [...new Set(this.logs.map(log => log.userId))].length;
        const commandCounts = {};
        
        this.logs.forEach(log => {
            commandCounts[log.command] = (commandCounts[log.command] || 0) + 1;
        });
        
        return {
            totalCommands,
            uniqueUsers,
            commandCounts,
            recentLogs: this.logs.slice(-10)
        };
    }

    getUserLogs(userId, limit = 20) {
        // Get logs for specific user, most recent first
        const userLogs = this.logs
            .filter(log => log.userId === userId)
            .reverse()
            .slice(0, limit);
        
        return userLogs;
    }

    getUserStats(userId) {
        const userLogs = this.logs.filter(log => log.userId === userId);
        const totalCommands = userLogs.length;
        const commandCounts = {};
        
        userLogs.forEach(log => {
            commandCounts[log.command] = (commandCounts[log.command] || 0) + 1;
        });
        
        return {
            totalCommands,
            commandCounts,
            recentLogs: userLogs.slice(-10).reverse()
        };
    }
}

// ==========================================
// DATABASE API CLASS
// ==========================================
class DatabaseAPI {
    constructor(brainUrl) {
        this.brainUrl = brainUrl;
    }

    async makeRequest(endpoint, params = {}) {
        try {
            const url = new URL(endpoint, this.brainUrl);
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined) {
                    url.searchParams.append(key, params[key]);
                }
            });

            const response = await fetch(url.toString());
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`✅Lỗi API (${endpoint}):`, error);
            throw error;
        }
    }

    async searchPlayer(playerName) {
        return await this.makeRequest('/player', { name: playerName });
    }

    async searchGang(gangName) {
        return await this.makeRequest('/gang', { name: gangName });
    }

    async getBossServers() {
        return await this.makeRequest('/boss');
    }

    async getRiftServers() {
        return await this.makeRequest('/rift');
    }

    async clearData(type) {
        try {
            const response = await fetch(`${this.brainUrl}/clear-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    type: type,
                    confirm: true  // Add required confirm field
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`✅Lỗi Clear Data:`, error);
            throw error;
        }
    }

    async scanJobIds() {
        try {
            const response = await fetch(`${this.brainUrl}/scan-jobids`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`✅Lỗi Scan JobIds:`, error);
            throw error;
        }
    }
}

// ==========================================
// INITIALIZE SYSTEMS
// ==========================================
const keySystem = new KeySystem();
const usageLogger = new UsageLogger();
const databaseAPI = new DatabaseAPI(CONFIG.BRAIN_URL);

// ==========================================
// BOT SETUP
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Utility functions
function isAdmin(userId) {
    return CONFIG.ADMIN_USER_IDS.includes(userId);
}

// ==========================================
// SLASH COMMANDS - FULL VERSION
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command để kiểm tra bot hoạt động'),

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
                .setDescription('số lượt (usage) hoặc gi(time)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('maxusers')
                .setDescription('số người tối đa có thể dùng key')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('usagelimit')
                .setDescription('Giới hạn lượt mỗi user (0 = không giới hạn)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('keyusage')
        .setDescription('Xem usage của key hiện tại')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key để kiểm tra usage')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('[ADMIN] Xem thống kê sử dụng bot'),

    new SlashCommandBuilder()
        .setName('logs')
        .setDescription('[ADMIN] Xem lịch số sử dụng bot của user')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('Discord User ID (để trống để xem của bạn)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('số lượng logs (mặc định: 10)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('[ADMIN] Clear database (players/gangs/servers)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại data cần clear')
                .setRequired(true)
                .addChoices(
                    { name: 'old - Clear servers ✅8h old', value: 'old' },
                    { name: 'confirm - Clear all data', value: 'confirm' },
                    { name: 'players - Clear players only', value: 'players' },
                    { name: 'gangs - Clear gangs only', value: 'gangs' },
                    { name: 'servers - Clear servers only', value: 'servers' }
                )),

    new SlashCommandBuilder()
        .setName('scan')
        .setDescription('[ADMIN] Quét JobId mới để thêm vào queue'),
];

// ==========================================
// COMMAND HANDLERS
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(`[DISCORD] Command: /${commandName} by ${username} (${userId})`);

    try {
        // Defer reply to prevent timeout
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (commandName === 'test') {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Test Success')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Status', value: '✅Bot hoạt động bình thường', inline: true },
                    { name: 'User', value: username, inline: true },
                    { name: 'Time', value: new Date().toLocaleString('vi-VN'), inline: true }
                );

            return await interaction.editReply({ embeds: [embed] });
        }

        // Commands that require keys
        const keyCommands = ['username', 'gang', 'boss', 'rift'];
        if (keyCommands.includes(commandName)) {
            const key = interaction.options.getString('key');
            
            // Validate key
            const validation = keySystem.isValidKey(key, userId);
            if (!validation.valid) {
                const embed = new EmbedBuilder()
                    .setTitle('Invalid Key')
                    .setColor(0xff0000)
                    .setDescription(validation.reason);
                
                return await interaction.editReply({ embeds: [embed] });
            }

            // Use key
            keySystem.useKey(key, userId);

            try {
                let result = null;
                let embed = null;

                if (commandName === 'username') {
                    const playerName = interaction.options.getString('player');
                    result = await databaseAPI.searchPlayer(playerName);
                    
                    if (result.success && result.data.length > 0) {
                        embed = new EmbedBuilder()
                            .setTitle(`🎮 Player Found: ${playerName}`)
                            .setColor(0x00ff00)
                            .setDescription(`Found **${result.data.length}** player(s)`);
                        
                        // Each player only has 1 latest server
                        result.data.slice(0, 20).forEach((player) => {
                            const fishstrapLink = `${CONFIG.FISHSTRAP_BASE}${player.jobId}`;
                            
                            // Calculate time ago
                            const now = Math.floor(Date.now() / 1000);
                            const timeDiff = now - player.timestamp;
                            const minutesAgo = Math.floor(timeDiff / 60);
                            
                            let timeText = '';
                            if (minutesAgo >= 60) {
                                const hoursAgo = Math.floor(minutesAgo / 60);
                                const remainingMinutes = minutesAgo % 60;
                                if (remainingMinutes > 0) {
                                    timeText = `${hoursAgo}h ${remainingMinutes}m ago`;
                                } else {
                                    timeText = `${hoursAgo}h ago`;
                                }
                            } else {
                                timeText = `${minutesAgo}m ago`;
                            }
                            
                            embed.addFields({
                                name: `👤 ${player.displayName}`,
                                value: `🕒 Found: **${timeText}**\n🔗 [Join Server \`${player.jobId.substring(0, 8)}...\`](${fishstrapLink})`,
                                inline: false
                            });
                        });
                        
                        if (result.data.length > 20) {
                            embed.setFooter({ text: `Showing 20/${result.data.length} players` });
                        }
                        
                        usageLogger.logUsage(userId, username, key, commandName, `Found ${result.data.length} results`);
                    } else {
                        embed = new EmbedBuilder()
                            .setTitle('🔍 Not Found')
                            .setColor(0xffa500)
                            .setDescription(`No player found with name: **${playerName}**`);
                        
                        usageLogger.logUsage(userId, username, key, commandName, 'No results');
                    }
                }

                else if (commandName === 'gang') {
                    const gangName = interaction.options.getString('name');
                    result = await databaseAPI.searchGang(gangName);
                    
                    if (result.success && result.data.length > 0) {
                        // Group results by gang name
                        const gangGroups = {};
                        result.data.forEach(gang => {
                            if (!gangGroups[gang.Name]) {
                                gangGroups[gang.Name] = [];
                            }
                            gangGroups[gang.Name].push(gang);
                        });
                        
                        embed = new EmbedBuilder()
                            .setTitle(`⚔️ Gang Found: ${gangName}`)
                            .setColor(0x00ff00)
                            .setDescription(`Found **${Object.keys(gangGroups).length}** gang(s) with **${result.data.length}** server(s)`);
                        
                        // Display each gang with all its servers
                        Object.entries(gangGroups).forEach(([name, servers]) => {
                            // Sort servers by most recent first
                            servers.sort((a, b) => b.timestamp - a.timestamp);
                            
                            let serverList = '';
                            servers.slice(0, 10).forEach((server, index) => { // Limit 10 servers per gang
                                const fishstrapLink = `${CONFIG.FISHSTRAP_BASE}${server.jobId}`;
                                
                                // Calculate time ago
                                const now = Math.floor(Date.now() / 1000);
                                const timeDiff = now - server.timestamp;
                                const minutesAgo = Math.floor(timeDiff / 60);
                                
                                let timeText = '';
                                if (minutesAgo >= 60) {
                                    const hoursAgo = Math.floor(minutesAgo / 60);
                                    timeText = `${hoursAgo}h ${minutesAgo % 60}m ago`;
                                } else {
                                    timeText = `${minutesAgo}m ago`;
                                }
                                
                                serverList += `✅Server \`${server.jobId.substring(0, 8)}...\` - 🕒 ${timeText} [🔗 Join](${fishstrapLink})\n`;
                            });
                            
                            if (servers.length > 10) {
                                serverList += `✅_and ${servers.length - 10} more servers..._\n`;
                            }
                            
                            embed.addFields({
                                name: `🏴 ${name}`,
                                value: serverList || 'No servers',
                                inline: false
                            });
                        });
                        
                        usageLogger.logUsage(userId, username, key, commandName, `Found ${result.data.length} results`);
                    } else {
                        embed = new EmbedBuilder()
                            .setTitle('🔍 Not Found')
                            .setColor(0xffa500)
                            .setDescription(`No gang found with name: **${gangName}**`);
                        
                        usageLogger.logUsage(userId, username, key, commandName, 'No results');
                    }
                }

                else if (commandName === 'boss') {
                    result = await databaseAPI.getBossServers();
                    
                    if (result.success && result.data.length > 0) {
                        embed = new EmbedBuilder()
                            .setTitle('👹 Boss Servers Upcoming')
                            .setColor(0xff4500);
                        
                        result.data.slice(0, 15).forEach((server, index) => {
                            const fishstrapLink = `${CONFIG.FISHSTRAP_BASE}${server.jobId}`;
                            const timeLeft = server.bossTimeLeft || 'N/A';
                            embed.addFields({
                                name: `#${index + 1} - Server ${server.jobId}`,
                                value: `✅Time Left: ${timeLeft}\n🕐 Server Time: ${server.serverTime || 'N/A'}\n🔗 [Join Server](${fishstrapLink})`,
                                inline: true
                            });
                        });
                        
                        usageLogger.logUsage(userId, username, key, commandName, `Found ${result.data.length} boss servers`);
                    } else {
                        embed = new EmbedBuilder()
                            .setTitle('No Boss Servers')
                            .setColor(0xffa500)
                            .setDescription('Currently no servers with upcoming Boss spawn');
                        
                        usageLogger.logUsage(userId, username, key, commandName, 'No boss servers');
                    }
                }

                else if (commandName === 'rift') {
                    result = await databaseAPI.getRiftServers();
                    
                    if (result.success && result.data.length > 0) {
                        embed = new EmbedBuilder()
                            .setTitle('🌀 Rift Spawner')
                            .setColor(0x8a2be2);
                        
                        result.data.slice(0, 15).forEach((server, index) => {
                            const fishstrapLink = `${CONFIG.FISHSTRAP_BASE}${server.jobId}`;
                            const timeLeft = server.riftTimeLeft || 'N/A';
                            embed.addFields({
                                name: `#${index + 1} - Server ${server.jobId}`,
                                value: `✅Time Left: ${timeLeft}\n🕐 Server Time: ${server.serverTime || 'N/A'}\n🔗 [Join Server](${fishstrapLink})`,
                                inline: true
                            });
                        });
                        
                        usageLogger.logUsage(userId, username, key, commandName, `Found ${result.data.length} rift servers`);
                    } else {
                        embed = new EmbedBuilder()
                            .setTitle('🌀 No Rift Servers')
                            .setColor(0xffa500)
                            .setDescription('Currently no servers with upcoming Rift spawn');
                        
                        usageLogger.logUsage(userId, username, key, commandName, 'No rift servers');
                    }
                }

                return await interaction.editReply({ embeds: [embed] });

            } catch (apiError) {
                console.error(`✅Lỗi API cho lệnh ${commandName}:`, apiError);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('✅Connection Error')
                    .setColor(0xff0000)
                    .setDescription('Cannot connect to database. Please try again later.');
                
                usageLogger.logUsage(userId, username, key, commandName, 'ERROR');
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
        }

        if (commandName === 'createkey') {
            if (!isAdmin(userId)) {
                return await interaction.editReply({ content: '✅Chỉ admin mới có thể sử dụng lệnh này!' });
            }

            const type = interaction.options.getString('type');
            const value = interaction.options.getInteger('value');
            const maxUsers = interaction.options.getInteger('maxusers');
            const usageLimit = interaction.options.getInteger('usagelimit');

            const keyId = keySystem.createKey(type, value, maxUsers, usageLimit);
            
            const embed = new EmbedBuilder()
                .setTitle('🔑 Key created successfully!')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Key ID', value: `\`${keyId}\``, inline: false },
                    { name: 'Type', value: type === 'usage' ? 'Usage-based' : 'Time-based', inline: true },
                    { name: 'Value', value: type === 'usage' ? `${value} uses` : `${value} hours`, inline: true },
                    { name: 'Created by', value: username, inline: true }
                );

            if (maxUsers) {
                embed.addFields({ name: 'Max Users', value: `${maxUsers} users`, inline: true });
            }
            if (usageLimit) {
                embed.addFields({ name: 'Usage Limit/User', value: `${usageLimit} lượt`, inline: true });
            }

            return await interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'keyusage') {
            const key = interaction.options.getString('key');
            const keyInfo = keySystem.getKeyInfo(key);
            
            if (!keyInfo) {
                return await interaction.editReply({ content: 'Key Not Found !' });
            }

            const embed = new EmbedBuilder()
                .setTitle('Info Key')
                .setColor(0x0099ff)
                .addFields(
                    { name: 'Key ID', value: `\`${key}\``, inline: false },
                    { name: 'Loại', value: keyInfo.type === 'usage' ? 'Theo lượt' : 'Theo thời gian', inline: true },
                    { name: 'Đã sử dụng', value: `${keyInfo.used}/${keyInfo.value}`, inline: true },
                    { name: 'số người dùng', value: `${keyInfo.uniqueUsers}`, inline: true }
                );

            if (keyInfo.type === 'usage') {
                embed.addFields({ name: 'Còn lại', value: `${keyInfo.remaining} lượt`, inline: true });
            }

            if (keyInfo.timeLeft !== null) {
                const hours = Math.floor(keyInfo.timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((keyInfo.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                embed.addFields({ name: 'Thời gian còn lại', value: `${hours}h ${minutes}m`, inline: true });
            }

            if (keyInfo.userUsage[userId]) {
                embed.addFields({ name: 'Lượt của bạn', value: `${keyInfo.userUsage[userId]}`, inline: true });
            }

            return await interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'stats') {
            if (!isAdmin(userId)) {
                return await interaction.editReply({ content: 'Chỉ admin mới sử dụng được lệnh này!' });
            }

            const stats = usageLogger.getStats();
            
            const embed = new EmbedBuilder()
                .setTitle('📈 Thống kê Bot')
                .setColor(0x9932cc)
                .addFields(
                    { name: 'Tổng lệnh', value: `${stats.totalCommands}`, inline: true },
                    { name: 'Người dùng', value: `${stats.uniqueUsers}`, inline: true },
                    { name: 'Commands', value: Object.entries(stats.commandCounts).map(([cmd, count]) => `${cmd}: ${count}`).join('\n') || 'Chưa có', inline: false }
                );

            return await interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'logs') {
            if (!isAdmin(userId)) {
                return await interaction.editReply({ content: 'Chỉ admin mới có thể sử dụng lệnh này!' });
            }

            const targetUserId = interaction.options.getString('userid') || userId;
            const limit = interaction.options.getInteger('limit') || 10;
            
            const userLogs = usageLogger.getUserLogs(targetUserId, limit);
            const userStats = usageLogger.getUserStats(targetUserId);
            
            if (userLogs.length === 0) {
                return await interaction.editReply({ content: `✅Không tìm thấy logs cho user <@${targetUserId}>` });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Lịch số sử dụng bot - <@${targetUserId}>`)
                .setColor(0x3498db)
                .addFields(
                    { name: 'Tổng lệnh', value: `${userStats.totalCommands}`, inline: true },
                    { name: 'Commands', value: Object.entries(userStats.commandCounts).map(([cmd, count]) => `${cmd}: ${count}`).join('\n') || 'Chưa có', inline: true }
                )
                .setFooter({ text: `Showing ${userLogs.length} recent logs` });

            // Add recent logs
            const logsText = userLogs.map(log => {
                const time = new Date(log.timestamp).toLocaleString('vi-VN');
                const status = log.success ? '✅' : '❌';
                return `${status} **${log.command}** - ${time}\n   Key: \`${log.keyId ? log.keyId.substring(0, 8) + '...' : 'N/A'}\` | Result: ${log.result}`;
            }).join('\n\n');

            if (logsText.length > 0) {
                // Split into multiple fields if too long
                const chunks = [];
                let currentChunk = '';
                logsText.split('\n\n').forEach(log => {
                    if ((currentChunk + log).length > 1000) {
                        chunks.push(currentChunk);
                        currentChunk = log;
                    } else {
                        currentChunk += (currentChunk ? '\n\n' : '') + log;
                    }
                });
                if (currentChunk) chunks.push(currentChunk);

                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? 'Logs gần đây' : `Logs (tiếp)`,
                        value: chunk,
                        inline: false
                    });
                });
            }

            return await interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'clear') {
            if (!isAdmin(userId)) {
                return await interaction.editReply({ content: 'Chỉ admin mới sử dụng lệnh này!' });
            }

            const type = interaction.options.getString('type');

            try {
                const result = await databaseAPI.clearData(type);
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setTitle('🧹 Database Cleared Successfully')
                        .setColor(0x00ff00)
                        .addFields(
                            { name: 'Clear Type', value: type, inline: true },
                            { name: 'Executed By', value: username, inline: true },
                            { name: 'Time', value: new Date().toLocaleString('vi-VN'), inline: true }
                        );

                    if (result.cleared) {
                        embed.addFields(
                            { name: 'Servers Cleared', value: `${result.cleared.servers}`, inline: true },
                            { name: 'Players Cleared', value: `${result.cleared.players}`, inline: true },
                            { name: 'Gangs Cleared', value: `${result.cleared.gangs}`, inline: true }
                        );
                    }

                    usageLogger.logUsage(userId, username, 'clear', `Success - ${type}`);
                    return await interaction.editReply({ embeds: [embed] });
                } else {
                    usageLogger.logUsage(userId, username, 'clear', 'Failed');
                    return await interaction.editReply({ content: `✅Clear failed: ${result.error || 'Unknown error'}` });
                }

            } catch (apiError) {
                console.error(`✅Lỗi Clear API:`, apiError);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('✅Clear Data Error')
                    .setColor(0xff0000)
                    .setDescription(`API Error: ${apiError.message}`);
                
                usageLogger.logUsage(userId, username, 'clear', 'ERROR');
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
        }

        if (commandName === 'scan') {
            if (!isAdmin(userId)) {
                return await interaction.editReply({ content: 'Chỉ admin mới có thể sử dụng lệnh này!' });
            }

            try {
                const result = await databaseAPI.scanJobIds();
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setTitle('🔍 JobId Scan Completed')
                        .setColor(0x00ff00)
                        .addFields(
                            { name: 'Status', value: 'Success', inline: true },
                            { name: 'Total Scanned', value: `${result.totalScanned || 0}`, inline: true },
                            { name: 'New JobIds', value: `${result.newJobIds || 0}`, inline: true },
                            { name: 'Available Count', value: `${result.availableCount || 0}`, inline: true },
                            { name: 'Executed By', value: username, inline: true },
                            { name: 'Time', value: new Date().toLocaleString('vi-VN'), inline: true }
                        );

                    usageLogger.logUsage(userId, username, 'scan', 'Success');
                    return await interaction.editReply({ embeds: [embed] });
                } else {
                    usageLogger.logUsage(userId, username, 'scan', 'Failed');
                    return await interaction.editReply({ content: `✅Scan failed: ${result.error || 'Unknown error'}` });
                }

            } catch (apiError) {
                console.error(`✅Lỗi Scan API:`, apiError);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('✅Scan Error')
                    .setColor(0xff0000)
                    .setDescription(`API Error: ${apiError.message}`);
                
                usageLogger.logUsage(userId, username, 'scan', 'ERROR');
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
        }

    } catch (error) {
        console.error('✅Lỗi lệnh:', error);
        
        try {
            return await interaction.editReply({ content: '✅Có lỗi xảy ra khi xử lý lệnh.' });
        } catch (replyError) {
            console.error('✅Lỗi phản hồi:', replyError.message);
        }
    }
});

// ==========================================
// BOT STARTUP
// ==========================================
client.once('ready', async () => {
    console.log(`✅Bot đã online: ${client.user.tag}`);
    console.log(`🔧 Kiểm tra cấu hình:`);
    console.log(`  - ADMIN_USER_IDS: ${CONFIG.ADMIN_USER_IDS.join(', ')}`);
    console.log(`  - BRAIN_URL: ${CONFIG.BRAIN_URL}`);
    
    // Register slash commands
    try {
        console.log('📝 Đang đăng ký slash commands...');
        console.log(`📝 Lệnh cần đăng ký: ${commands.map(cmd => cmd.name).join(', ')}`);
        await client.application.commands.set(commands);
        console.log('✅Slash commands đã được đăng ký thành công!');
        
        // List registered commands for verification
        const registeredCommands = await client.application.commands.fetch();
        console.log(`✅Lệnh đã đăng ký: ${registeredCommands.map(cmd => cmd.name).join(', ')}`);
    } catch (error) {
        console.error('✅Lỗi đăng ký commands:', error);
    }
});

client.on('error', (error) => {
    console.error('✅Lỗi Discord client:', error);
});

client.on('warn', (warning) => {
    console.warn('⚠️ Cảnh báo Discord client:', warning);
});

// Login
console.log('🤖 Đang khởi động Discord Bot...');
console.log('🔑 Token validation: ✅PASSED');
console.log(`👑 Admin IDs: ${CONFIG.ADMIN_USER_IDS.join(', ')}`);
console.log(`🌐 Brain URL: ${CONFIG.BRAIN_URL}`);

client.login(CONFIG.TOKEN).catch(error => {
    console.error('✅Không thểđăng nhập Discord Bot:', error.message);
    if (error.message.includes('invalid token')) {
        console.error('💡 Hãy kiểm tra lại DISCORD_TOKEN trong Railway environment variables');
        console.error('💡 Token phải có định dạng: MTxxx.xxx.xxx (không cần prefix "Bot")');
    }
    process.exit(1);
});
