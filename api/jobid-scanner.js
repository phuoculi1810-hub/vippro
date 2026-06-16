const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PLACE_ID = '13358463560'; // ID game Asura
const JOBIDS_DB_FILE = path.join(__dirname, '../data/jobids_queue.json');
const USED_JOBIDS_FILE = path.join(__dirname, '../data/used_jobids.json');

// Đảm bảo thư mục data tồn tại
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

class JobIdScanner {
    constructor() {
        this.loadData();
        this.rateLimitedUntil = 0; // Timestamp when rate limit expires
    }

    loadData() {
        // Load queue JobIds
        if (fs.existsSync(JOBIDS_DB_FILE)) {
            try {
                this.jobIdsQueue = JSON.parse(fs.readFileSync(JOBIDS_DB_FILE, 'utf8'));
            } catch (e) {
                this.jobIdsQueue = { available: [], scanning: [], failed: [] };
            }
        } else {
            this.jobIdsQueue = { available: [], scanning: [], failed: [] };
        }

        // Load used JobIds
        if (fs.existsSync(USED_JOBIDS_FILE)) {
            try {
                this.usedJobIds = new Set(JSON.parse(fs.readFileSync(USED_JOBIDS_FILE, 'utf8')));
            } catch (e) {
                this.usedJobIds = new Set();
            }
        } else {
            this.usedJobIds = new Set();
        }
    }

    saveData() {
        fs.writeFileSync(JOBIDS_DB_FILE, JSON.stringify(this.jobIdsQueue, null, 2));
        fs.writeFileSync(USED_JOBIDS_FILE, JSON.stringify([...this.usedJobIds], null, 2));
    }

    async scanNewJobIds() {
        // Check if still rate limited
        const now = Date.now();
        if (this.rateLimitedUntil > now) {
            const waitMinutes = Math.ceil((this.rateLimitedUntil - now) / 60000);
            console.log(`⏳ [JobId Scanner] Vẫn bị rate limit. Đợi thêm ${waitMinutes} phút...`);
            return {
                success: false,
                error: `Rate limited. Wait ${waitMinutes} more minutes.`,
                availableCount: this.jobIdsQueue.available.length,
                rateLimited: true,
                waitMinutes: waitMinutes
            };
        }

        console.log(`🚀 [JobId Scanner] Bắt đầu quét JobId cho game: ${PLACE_ID}...`);
        
        let allJobIds = [];
        let cursor = '';
        let pageCount = 1;
        
        try {
            while (true) {
                const url = `https://games.roblox.com/v1/games/${PLACE_ID}/servers/Public?limit=100&cursor=${cursor}`;
                
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    timeout: 10000
                });

                const data = response.data;
                if (data.data && data.data.length > 0) {
                    const pageJobIds = data.data.map(server => server.id);
                    allJobIds = allJobIds.concat(pageJobIds);
                    
                    console.log(`📄 Trang ${pageCount}: Lấy được ${data.data.length} servers (Tổng: ${allJobIds.length})`);
                    
                    if (data.nextPageCursor) {
                        cursor = data.nextPageCursor;
                        pageCount++;
                        // Đợi để tránh Rate Limit
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            // Filter out used JobIds
            const newJobIds = allJobIds.filter(id => !this.usedJobIds.has(id));
            
            // Add to available queue
            this.jobIdsQueue.available.push(...newJobIds);
            
            // Remove duplicates
            this.jobIdsQueue.available = [...new Set(this.jobIdsQueue.available)];
            
            this.saveData();

            console.log(`✅ [JobId Scanner] Hoàn thành!`);
            console.log(`📊 Tổng JobId mới: ${newJobIds.length}`);
            console.log(`📊 JobId có sẵn: ${this.jobIdsQueue.available.length}`);
            console.log(`📊 Đã sử dụng: ${this.usedJobIds.size}`);
            
            return {
                success: true,
                totalScanned: allJobIds.length,
                newJobIds: newJobIds.length,
                availableCount: this.jobIdsQueue.available.length
            };

        } catch (error) {
            console.error('❌ [JobId Scanner] Lỗi:', error.message);
            
            // Check if rate limited (429 error)
            if (error.response && error.response.status === 429) {
                // Set rate limit for 20 minutes
                this.rateLimitedUntil = Date.now() + (20 * 60 * 1000);
                console.error('⚠️ Rate Limit: Bị Roblox chặn. Đợi 20 phút trước khi quét lại.');
                console.error(`⏰ Có thể quét lại sau: ${new Date(this.rateLimitedUntil).toLocaleTimeString('vi-VN')}`);
                
                return {
                    success: false,
                    error: 'Rate limited by Roblox. Wait 20 minutes.',
                    availableCount: this.jobIdsQueue.available.length,
                    rateLimited: true,
                    waitMinutes: 20
                };
            }
            
            return {
                success: false,
                error: error.message,
                availableCount: this.jobIdsQueue.available.length
            };
        }
    }

    // Lấy JobId tiếp theo cho client (thread-safe)
    getNextJobId(threadId = 'default') {
        if (this.jobIdsQueue.available.length === 0) {
            return null; // Hết JobId
        }

        const jobId = this.jobIdsQueue.available.shift();
        
        // Move to scanning queue với thread info
        this.jobIdsQueue.scanning.push({
            jobId: jobId,
            threadId: threadId,
            assignedAt: Date.now()
        });

        this.saveData();
        return jobId;
    }

    // Đánh dấu JobId đã hoàn thành
    markJobIdCompleted(jobId, result = 'completed') {
        // Remove from scanning
        this.jobIdsQueue.scanning = this.jobIdsQueue.scanning.filter(item => item.jobId !== jobId);
        
        if (result === 'failed') {
            // Add to failed queue for retry
            this.jobIdsQueue.failed.push({
                jobId: jobId,
                failedAt: Date.now()
            });
        } else {
            // Add to used set
            this.usedJobIds.add(jobId);
        }

        this.saveData();
    }

    // Đánh dấu server full (xóa ngay không retry)
    markServerFull(jobId) {
        // Remove from all queues
        this.jobIdsQueue.scanning = this.jobIdsQueue.scanning.filter(item => item.jobId !== jobId);
        this.jobIdsQueue.failed = this.jobIdsQueue.failed.filter(item => item.jobId !== jobId);
        
        // Add to used (blacklist)
        this.usedJobIds.add(jobId);
        this.saveData();
        
        console.log(`🚫 [JobId Scanner] Server full: ${jobId.substring(0, 8)}...`);
    }

    // Retry failed JobIds
    retryFailedJobIds() {
        const retryItems = this.jobIdsQueue.failed.splice(0, 10); // Retry 10 failed at a time
        retryItems.forEach(item => {
            this.jobIdsQueue.available.push(item.jobId);
        });
        this.saveData();
        return retryItems.length;
    }

    // Get status
    getStatus() {
        return {
            available: this.jobIdsQueue.available.length,
            scanning: this.jobIdsQueue.scanning.length,
            failed: this.jobIdsQueue.failed.length,
            used: this.usedJobIds.size,
            scanningList: this.jobIdsQueue.scanning
        };
    }

    // Clean up stuck scanning JobIds (older than 10 minutes)
    cleanupStuckScanning() {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const stuckItems = this.jobIdsQueue.scanning.filter(item => item.assignedAt < tenMinutesAgo);
        
        // Move stuck items back to available
        stuckItems.forEach(item => {
            this.jobIdsQueue.available.push(item.jobId);
        });
        
        // Remove from scanning
        this.jobIdsQueue.scanning = this.jobIdsQueue.scanning.filter(item => item.assignedAt >= tenMinutesAgo);
        
        if (stuckItems.length > 0) {
            console.log(`🔄 [JobId Scanner] Moved ${stuckItems.length} stuck JobIds back to queue`);
            this.saveData();
        }
        
        return stuckItems.length;
    }

    // Manually add JobIds to queue (for Discord bot /jobid command)
    addJobIdsManually(jobIdList) {
        const added = [];
        const skipped = [];
        
        jobIdList.forEach(jobId => {
            // Skip if already used
            if (this.usedJobIds.has(jobId)) {
                skipped.push({ jobId, reason: 'already used' });
                return;
            }
            
            // Skip if already in available queue
            if (this.jobIdsQueue.available.includes(jobId)) {
                skipped.push({ jobId, reason: 'already in queue' });
                return;
            }
            
            // Skip if currently scanning
            if (this.jobIdsQueue.scanning.some(item => item.jobId === jobId)) {
                skipped.push({ jobId, reason: 'currently scanning' });
                return;
            }
            
            // Add to queue
            this.jobIdsQueue.available.push(jobId);
            added.push(jobId);
        });
        
        this.saveData();
        
        console.log(`📥 [JobId Scanner] Thêm thủ công: ${added.length} JobIds, bỏ qua: ${skipped.length}`);
        
        return {
            added: added,
            skipped: skipped,
            totalAdded: added.length,
            totalSkipped: skipped.length
        };
    }
}

module.exports = JobIdScanner;