// Keep-alive service để tránh app bị sleep trên hosting miễn phí
const axios = require('axios');

class KeepAlive {
    constructor(url, interval = 5) {
        this.url = url;
        this.interval = interval * 60 * 1000; // Convert to milliseconds
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        
        console.log(`🔄 Keep-alive started: pinging ${this.url} every ${this.interval/60000} minutes`);
        this.isRunning = true;

        this.pingInterval = setInterval(async () => {
            try {
                const response = await axios.get(this.url, { timeout: 10000 });
                console.log(`✅ Keep-alive ping successful: ${response.status}`);
            } catch (error) {
                console.log(`❌ Keep-alive ping failed: ${error.message}`);
            }
        }, this.interval);
    }

    stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.isRunning = false;
            console.log('⏹ Keep-alive stopped');
        }
    }
}

// Export for use in other files
module.exports = KeepAlive;

// Auto-start if this file is run directly
if (require.main === module) {
    const keepAlive = new KeepAlive('http://localhost:3000/status');
    keepAlive.start();

    // Graceful shutdown
    process.on('SIGINT', () => {
        keepAlive.stop();
        process.exit(0);
    });
}