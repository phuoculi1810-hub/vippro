const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

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
    console.error('❌ DISCORD_TOKEN không được thiết lập trong environment variables!');
    console.error('💡 Thêm DISCORD_TOKEN vào Railway Variables hoặc .env file');
    process.exit(1);
}

if (CONFIG.ADMIN_USER_IDS.length === 0) {
    console.error('❌ ADMIN_USER_IDS không được thiết lập trong environment variables!');
    console.error('💡 Thêm Discord User ID của bạn vào ADMIN_USER_IDS trong Railway Variables');
    process.exit(1);
}

// ==========================================
// SIMPLE BOT SETUP
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Utility functions
function isAdmin(userId) {
    return CONFIG.ADMIN_USER_IDS.includes(userId);
}

// ==========================================
// SIMPLE SLASH COMMANDS
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command để kiểm tra bot hoạt động'),

    new SlashCommandBuilder()
        .setName('createkey')
        .setDescription('[ADMIN] Tạo key mới - TEST VERSION')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại key')
                .setRequired(true)
                .addChoices(
                    { name: 'Test Key', value: 'test' }
                )),
];

// ==========================================
// COMMAND HANDLERS
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const userId = interaction.user.id;

    console.log(`[DISCORD] Command: /${commandName} by ${interaction.user.username} (${userId})`);

    try {
        // Defer reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        if (commandName === 'test') {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Test Success')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Status', value: '✅ Bot hoạt động bình thường', inline: true },
                    { name: 'User', value: interaction.user.username, inline: true },
                    { name: 'Time', value: new Date().toLocaleString('vi-VN'), inline: true }
                );

            return await interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'createkey') {
            if (!isAdmin(userId)) {
                return await interaction.editReply({ content: '❌ Chỉ admin mới có thể sử dụng lệnh này!' });
            }

            const keyId = 'test_' + Math.random().toString(36).substr(2, 8);
            
            const embed = new EmbedBuilder()
                .setTitle('🔑 Test Key Created')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Key ID', value: `\`${keyId}\``, inline: false },
                    { name: 'Type', value: 'Test Key', inline: true },
                    { name: 'Created By', value: interaction.user.username, inline: true }
                );

            return await interaction.editReply({ embeds: [embed] });
        }

    } catch (error) {
        console.error('❌ Command error:', error);
        
        try {
            return await interaction.editReply({ content: '❌ Có lỗi xảy ra khi xử lý lệnh.' });
        } catch (replyError) {
            console.error('❌ Reply error:', replyError.message);
        }
    }
});

// ==========================================
// BOT STARTUP
// ==========================================
client.once('ready', async () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
    console.log(`🔧 Config check:`);
    console.log(`  - ADMIN_USER_IDS: ${CONFIG.ADMIN_USER_IDS.join(', ')}`);
    console.log(`  - BRAIN_URL: ${CONFIG.BRAIN_URL}`);
    
    // Register slash commands
    try {
        console.log('📝 Đang đăng ký slash commands...');
        await client.application.commands.set(commands);
        console.log('✅ Slash commands đã được đăng ký thành công!');
    } catch (error) {
        console.error('❌ Lỗi đăng ký commands:', error);
    }
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

client.on('warn', (warning) => {
    console.warn('⚠️ Discord client warning:', warning);
});

// Validate config before login
console.log('🤖 Đang khởi động Discord Bot...');
console.log('🔑 Token validation: ✅ PASSED');
console.log(`👑 Admin IDs: ${CONFIG.ADMIN_USER_IDS.join(', ')}`);
console.log(`🌐 Brain URL: ${CONFIG.BRAIN_URL}`);

client.login(CONFIG.TOKEN).catch(error => {
    console.error('❌ Không thể đăng nhập Discord Bot:', error.message);
    if (error.message.includes('invalid token')) {
        console.error('💡 Hãy kiểm tra lại DISCORD_TOKEN trong Railway environment variables');
        console.error('💡 Token phải có định dạng: MTxxx.xxx.xxx (không cần prefix "Bot")');
    }
    process.exit(1);
});