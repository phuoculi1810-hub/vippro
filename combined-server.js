// Combined server cho hosting: API + Discord Bot trong 1 process
console.log('🚀 Starting Combined Server...');

// Start API server first
try {
    require('./rift.js');
    console.log('✅ API Server started successfully');
    
    // Start Discord Bot after API is ready
    setTimeout(() => {
        try {
            console.log('🤖 Starting Discord Bot...');
            require('./discord-bot/bot.js');
        } catch (botError) {
            console.error('❌ Bot startup error:', botError.message);
            console.log('⚠️ Continuing without Discord Bot...');
        }
    }, 3000);
    
} catch (apiError) {
    console.error('❌ API Server startup error:', apiError.message);
    process.exit(1);
}