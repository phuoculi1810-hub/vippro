// Simple Combined Server - Fixed Version
console.log('🚀 Starting Simple Combined Server...');
console.log('📊 Environment Variables:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  PORT:', process.env.PORT);
console.log('  DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? 'SET' : 'NOT SET');
console.log('  ADMIN_USER_IDS:', process.env.ADMIN_USER_IDS ? 'SET' : 'NOT SET');
console.log('  BRAIN_URL:', process.env.BRAIN_URL);

try {
    console.log('🌐 Starting API Server...');
    require('./rift.js');
    console.log('✅ API Server started successfully');
    
    // Start Discord Bot after API is stable
    setTimeout(() => {
        if (process.env.DISCORD_TOKEN && process.env.ADMIN_USER_IDS) {
            console.log('🤖 Starting Discord Bot...');
            try {
                require('./discord-bot/bot.js');
            } catch (botError) {
                console.error('❌ Discord Bot failed:', botError.message);
            }
        } else {
            console.log('⚠️ Skipping Discord Bot - missing environment variables');
        }
    }, 3000);
    
} catch (error) {
    console.error('❌ Server startup failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}