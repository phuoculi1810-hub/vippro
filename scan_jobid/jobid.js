const axios = require('axios');
const fs = require('fs');

const PLACE_ID = '13358463560'; // ID game Asura
const OUTPUT_FILE = '../data/legacy_jobids.txt';

async function getAllJobIds() {
    let allJobIds = [];
    let cursor = '';
    let pageCount = 1;

    console.log(`🚀 [Legacy Scanner] Bat dau quet JobId cho game: ${PLACE_ID}...`);

    try {
        while (true) {
            const url = `https://games.roblox.com/v1/games/${PLACE_ID}/servers/Public?limit=100&cursor=${cursor}`;
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const data = response.data;
            if (data.data && data.data.length > 0) {
                const pageJobIds = data.data.map(server => server.id);
                allJobIds = allJobIds.concat(pageJobIds);
                
                console.log(`Trang ${pageCount}: Lay duoc ${data.data.length} servers (Tong cong: ${allJobIds.length})`);
                
                if (data.nextPageCursor) {
                    cursor = data.nextPageCursor;
                    pageCount++;
                    // Doi 1 chut de tranh bi Rate Limit (Roblox block IP)
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    break; // Het trang
                }
            } else {
                break;
            }
        }

        // Ghi vao file
        fs.writeFileSync(OUTPUT_FILE, allJobIds.join('\n'));
        console.log(`\n✅ THANH CONG!`);
        console.log(`- Tong so JobId: ${allJobIds.length}`);
        console.log(`- Ket qua da duoc luu vao file: ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('❌ LOI:', error.message);
        if (error.response && error.response.status === 429) {
            console.error('Loi 429: Ban dang bi Roblox chan tam thoi (Rate Limit). Hay doi vai phut roi thu lai.');
        }
    }
}

// Only run if called directly
if (require.main === module) {
    getAllJobIds();
}

module.exports = getAllJobIds;