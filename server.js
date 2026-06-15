// Simple server startup - chỉ chạy API trước
console.log('🚀 Starting Asura Scanner API...');

try {
    // Import và chạy API server
    require('./rift.js');
    console.log('✅ API Server is running!');
} catch (error) {
    console.error('❌ Startup error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}