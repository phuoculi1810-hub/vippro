--[[
    ASURA SCANNER V2 - ULTIMATE AUTOMATION
    - Quét toàn bộ players và gangs trong server
    - Sử dụng API JobId thread-safe  
    - Logic gettime từ ServerTimeReader.lua
    - Auto retry khi server full
]]

-- ==========================================
-- CONFIG
-- ==========================================
local CONFIG = {
    THREAD_ID = "thread_" .. math.random(1000, 9999), -- Unique thread ID
    BRAIN_URL = "https://vippro-production-0683.up.railway.app",
    AUTO_HOP = true,
    WAIT_TIME_PER_SERVER = 8, -- Tăng thời gian để quét kỹ hơn
    FISHSTRAP_URL = "https://www.fishstrap.app/v1/joingame?placeId=13358463560&gameInstanceId=",
}

-- ==========================================
-- CORE SYSTEM
-- ==========================================
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TeleportService = game:GetService("TeleportService")

repeat task.wait() until Players.LocalPlayer
local LocalPlayer = Players.LocalPlayer
local PlayerGui = LocalPlayer:WaitForChild("PlayerGui")

local currentJobId = game.JobId
local stopHop = false
local nextGui = nil

warn("🚀 ASURA SCANNER V2: INITIALIZING")
warn("📌 VERSION: 2.1.0 - FIXED FUNCTION ORDERING - " .. os.date("%H:%M:%S"))
print("👤 Người chơi: " .. LocalPlayer.Name)
print("🔗 Thread ID: " .. CONFIG.THREAD_ID)
print("🌍 Current JobId: " .. currentJobId:sub(1, 8) .. "...")
print("📡 Brain URL: " .. CONFIG.BRAIN_URL)

-- ==========================================
-- SERVER TIME READER (từ ServerTimeReader.lua)
-- ==========================================
local function parseServerAge(text)
    -- Lấy phần HH:MM:SS từ "Server Age: 23:20:46"
    local h, m, s = text:match("(%d+):(%d%d):(%d%d)$")
    if h and m and s then
        return tonumber(h) * 3600 + tonumber(m) * 60 + tonumber(s),
               string.format("%s:%s:%s", h, m, s)
    end
    return nil, nil
end

local function getServerAgeLabel()
    -- Path chính (Main HUD)
    local main = PlayerGui:FindFirstChild("Main")
    if main then
        local label = main:FindFirstChild("LabelAge", true)
        if label then return label, "Main HUD" end
    end

    -- Path phụ (TopbarUI Settings)  
    local topbarUI = PlayerGui:FindFirstChild("TopbarUI")
    if topbarUI then
        local label = topbarUI:FindFirstChild("LabelAge", true)
        if label then return label, "TopbarUI" end
    end

    -- Fallback: quét toàn bộ PlayerGui
    for _, obj in ipairs(PlayerGui:GetDescendants()) do
        if (obj:IsA("TextLabel") or obj:IsA("TextBox"))
            and obj.Name == "LabelAge" then
            return obj, "Auto-detect"
        end
    end

    return nil, nil
end

local function getServerAge()
    local label, source = getServerAgeLabel()
    if label then
        local secs, timeStr = parseServerAge(label.Text)
        if secs then
            return secs, timeStr
        end
    end
    return 0, "00:00:00"
end

-- ==========================================
-- HTTP REQUESTS - EXACT COPY FROM WORKING VERSION
-- ==========================================
local function getRequest()
    local requestFunc = (syn and syn.request) or (http and http.request) or http_request or request
    print("🔍 DEBUG - getRequest() result: " .. tostring(requestFunc))
    if requestFunc then
        print("✅ HTTP request function available: " .. tostring(type(requestFunc)))
    else
        warn("❌ No HTTP request function found!")
        warn("  - syn: " .. tostring(syn))
        warn("  - syn.request: " .. tostring(syn and syn.request))
        warn("  - http: " .. tostring(http))
        warn("  - http.request: " .. tostring(http and http.request))
        warn("  - http_request: " .. tostring(http_request))
        warn("  - request: " .. tostring(request))
    end
    return requestFunc
end

local function brainRequest(path, method, body)
    print("🔍 DEBUG - brainRequest called with path: " .. tostring(path))
    local req = getRequest()
    if not req then 
        warn("❌ No HTTP request function available!")
        return nil 
    end
    
    print("🔍 DEBUG - HTTP request function found, making request...")
    local ok, response = pcall(function()
        return req({
            Url = CONFIG.BRAIN_URL .. path,
            Method = method or "GET",
            Headers = {["Content-Type"] = "application/json"},
            Body = body and HttpService:JSONEncode(body) or nil
        })
    end)
    
    if ok then 
        print("🔍 DEBUG - Request successful")
        return response 
    else
        warn("❌ Request failed: " .. tostring(response))
        return nil
    end
end

-- ==========================================
-- FORWARD DECLARATIONS (to fix function scope issues)
-- ==========================================
local hopToNext -- Forward declaration

-- ==========================================
-- SCANNER FUNCTIONS
-- ==========================================

-- Quét tất cả players trong server
local function scanAllPlayers()
    local foundPlayers = {}
    for _, player in ipairs(Players:GetPlayers()) do
        if player ~= LocalPlayer then
            table.insert(foundPlayers, {
                name = player.Name,
                displayName = player.DisplayName,
                userId = player.UserId
            })
        end
    end
    return foundPlayers
end

-- Quét tất cả gangs chiếm base
local function scanAllGangs()
    local foundGangs = {}
    
    for _, obj in ipairs(workspace:GetDescendants()) do
        if obj:IsA("TextLabel") and obj.Parent:IsA("SurfaceGui") then
            local text = obj.Text
            
            -- Tìm gang gym (format: "Gang's GYM")
            if text:lower():find("gym") and text:find("'") then
                local gangName = text:gsub("'s GYM", ""):gsub("'S GYM", ""):gsub("'s Gym", ""):gsub("'S gym", "")
                gangName = gangName:gsub("^%s+", ""):gsub("%s+$", "") -- Trim spaces
                
                if gangName ~= "" then
                    local found = false
                    for _, existing in ipairs(foundGangs) do
                        if existing.name:lower() == gangName:lower() then
                            found = true
                            break
                        end
                    end
                    if not found then
                        table.insert(foundGangs, {
                            name = gangName,
                            type = "gym"
                        })
                    end
                end
            end
            
            -- Tìm gang base (format khác nếu có)
            -- TODO: Thêm logic tìm gang base khác nếu cần
        end
    end
    
    return foundGangs
end

-- Báo cáo server age về Brain Central
local function reportServerAge()
    local secs, timeStr = getServerAge()
    local minutes = math.floor(secs / 60)
    
    brainRequest("/report", "POST", {
        jobId = currentJobId,
        ageMinutes = minutes
    })
    print("📡 Đã báo cáo server age: " .. timeStr .. " (" .. minutes .. " phút)")
end

-- Báo cáo tất cả players tìm thấy
local function reportAllPlayers(players)
    for _, playerData in ipairs(players) do
        brainRequest("/report-find", "POST", {
            type = "player",
            name = playerData.name,
            displayName = playerData.displayName,
            userId = playerData.userId,
            jobId = currentJobId
        })
        print("👤 Đã lưu player: " .. playerData.name)
        task.wait(0.1) -- Tránh spam
    end
end

-- Báo cáo tất cả gangs tìm thấy
local function reportAllGangs(gangs)
    for _, gangData in ipairs(gangs) do
        brainRequest("/report-find", "POST", {
            type = "gang", 
            name = gangData.name,
            jobId = currentJobId
        })
        print("🏴 Đã lưu gang: " .. gangData.name)
        task.wait(0.1)
    end
end

-- Đánh dấu JobId hoàn thành
local function markJobCompleted(result)
    print("📝 DEBUG - markJobCompleted() called with result: " .. tostring(result))
    print("📝 Marking JobId completed: " .. tostring(result))
    
    local success, response = pcall(function()
        return brainRequest("/complete", "POST", {
            jobId = currentJobId,
            result = result or "completed"
        })
    end)
    
    if success and response then
        print("✅ JobId marked as completed")
    else
        warn("❌ Failed to mark JobId as completed: " .. tostring(response))
    end
end

-- Lấy JobId tiếp theo từ API
local function getNextJobId()
    print("📞 Đang lấy JobId tiếp theo từ API (Thread: " .. CONFIG.THREAD_ID .. ")...")
    
    -- Debug: Check if brainRequest is available
    if not brainRequest then
        warn("❌ brainRequest function not available!")
        return nil
    end
    
    local success, response = pcall(function()
        return brainRequest("/next/" .. CONFIG.THREAD_ID, "GET")
    end)
    
    if not success then
        warn("❌ Error making request: " .. tostring(response))
        return nil
    end
    
    if response and response.Body and response.Body ~= "NONE" then
        local jobId = response.Body:gsub("%s+", "")
        print("✅ Lấy được JobId: " .. jobId:sub(1, 8) .. "...")
        return jobId
    else
        print("❌ Không lấy được JobId từ API")
        if response then
            print("Response Body: " .. tostring(response.Body))
            print("Response Status: " .. tostring(response.StatusCode))
        else
            print("No response from API")
        end
        return nil
    end
end

-- Join server bằng JobId
local function joinServer(jobId)
    print("🚀 DEBUG - joinServer() called with JobId: " .. tostring(jobId))
    
    if not jobId or jobId == "" then 
        warn("⚠️ JobId trống, không thể join!")
        return 
    end
    
    print("🌍 Đang join server: " .. jobId)
    
    -- Add safety check for teleport
    local success, err = pcall(function()
        TeleportService:TeleportToPlaceInstance(game.PlaceId, jobId, LocalPlayer)
    end)
    
    if not success then
        warn("⚠️ Lỗi teleport: " .. tostring(err))
        -- Báo server lỗi và thử lấy server khác
        local reportSuccess, reportErr = pcall(function()
            brainRequest("/report-full", "POST", { jobId = jobId })
        end)
        
        if not reportSuccess then
            warn("❌ Error reporting server full: " .. tostring(reportErr))
        end
        
        task.wait(2)
        if hopToNext then -- Check if function exists
            local hopSuccess, hopErr = pcall(hopToNext)
            if not hopSuccess then
                warn("❌ Error calling hopToNext: " .. tostring(hopErr))
            end
        else
            warn("❌ hopToNext function not available!")
        end
    end
end

-- Print collected data for manual copy (OFFLINE MODE)
local function printCollectedData()
    print("\n" .. string.rep("=", 50))
    print("📋 COLLECTED DATA FOR MANUAL COPY")
    print(string.rep("=", 50))
    
    -- Scan players again for final output
    local players = scanAllPlayers()
    if #players > 0 then
        print("\n👥 PLAYERS FOUND:")
        for _, p in ipairs(players) do
            print("  " .. p.name .. " | " .. p.displayName .. " | " .. p.userId)
        end
    end
    
    -- Scan gangs again for final output
    local gangs = scanAllGangs()
    if #gangs > 0 then
        print("\n🏴 GANGS FOUND:")
        for _, g in ipairs(gangs) do
            print("  " .. g.name)
        end
    end
    
    print("\n🌍 SERVER: " .. currentJobId)
    local secs, timeStr = getServerAge()
    print("🕒 AGE: " .. timeStr)
    print(string.rep("=", 50))
end

-- ==========================================
-- BOSS & RIFT DETECTION
-- ==========================================
local function checkBoss()
    local secs, timeStr = getServerAge()
    local minutes = math.floor(secs / 60)
    
    -- Boss spawn mỗi 1 giờ (60 phút) tại phút 00
    local cycle = math.floor(minutes / 60)
    local minuteInCycle = minutes % 60
    
    -- Trong vòng 5 phút trước/sau spawn (55-05 phút)
    if minuteInCycle >= 55 or minuteInCycle <= 5 then
        local nextSpawnMinute = (cycle + 1) * 60
        local timeToBoss = nextSpawnMinute - minutes
        
        if timeToBoss <= 0 then
            -- Boss đã spawn
            local timeSinceBoss = -timeToBoss
            print("🔥 BOSS DETECTED: Đã spawn " .. timeSinceBoss .. " phút trước (Server age: " .. timeStr .. ")")
            return true, "spawn_" .. timeSinceBoss .. "m_ago"
        else
            -- Boss sắp spawn
            print("🔥 BOSS DETECTED: Sẽ spawn sau " .. timeToBoss .. " phút (Server age: " .. timeStr .. ")")
            return true, "spawn_in_" .. timeToBoss .. "m"
        end
    end
    
    return false, nil
end

local function checkRift()
    local secs, timeStr = getServerAge()
    local minutes = math.floor(secs / 60)
    
    -- Rift spawn mỗi 90 phút tại phút 00 của cycle
    local cycle = math.floor(minutes / 90)
    local minuteInCycle = minutes % 90
    
    -- Trong vòng 10 phút trước/sau spawn (80-10 phút)
    if minuteInCycle >= 80 or minuteInCycle <= 10 then
        local nextSpawnMinute = (cycle + 1) * 90
        local timeToRift = nextSpawnMinute - minutes
        
        if timeToRift <= 0 then
            -- Rift đã spawn
            local timeSinceRift = -timeToRift
            print("🌀 RIFT DETECTED: Đã spawn " .. timeSinceRift .. " phút trước (Server age: " .. timeStr .. ")")
            return true, "spawn_" .. timeSinceRift .. "m_ago"
        else
            -- Rift sắp spawn
            print("🌀 RIFT DETECTED: Sẽ spawn sau " .. timeToRift .. " phút (Server age: " .. timeStr .. ")")
            return true, "spawn_in_" .. timeToRift .. "m"
        end
    end
    
    return false, nil
end

-- ==========================================
-- GUI CONTROLS
-- ==========================================
local function showNextButton()
    if nextGui then nextGui:Destroy() end

    nextGui = Instance.new("ScreenGui")
    nextGui.Name = "AsuraScannerGui"
    nextGui.ResetOnSpawn = false
    nextGui.Parent = PlayerGui

    local btn = Instance.new("TextButton")
    btn.Name = "NextButton"
    btn.Size = UDim2.new(0, 140, 0, 55)
    btn.Position = UDim2.new(0.5, -70, 0.85, 0)
    btn.BackgroundColor3 = Color3.fromRGB(0, 170, 70)
    btn.BorderSizePixel = 0
    btn.Text = "▶ NEXT"
    btn.TextColor3 = Color3.new(1, 1, 1)
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 22
    btn.Parent = nextGui

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 8)
    corner.Parent = btn

    btn.MouseButton1Click:Connect(function()
        print("▶ NEXT - Tiếp tục scan server...")
        stopHop = false
        if nextGui then nextGui:Destroy() nextGui = nil end
        
        -- Đánh dấu hoàn thành và lấy server mới
        markJobCompleted("manual_next")
        task.wait(1)
        if hopToNext then -- Safety check
            hopToNext()
        else
            warn("❌ hopToNext function not available!")
        end
    end)
end

-- Hop đến server tiếp theo
function hopToNext() -- Make it global function
    print("\n" .. string.rep("=", 50))
    print("🚀 DEBUG - hopToNext() CALLED")
    print(string.rep("=", 50))
    
    if stopHop then
        print("⏸ Server hopping đã bị dừng")
        return
    end
    
    print("✅ stopHop is false, continuing with hop logic...")
    
    local retryCount = 0
    local maxRetries = 5
    
    while retryCount < maxRetries do
        print("\n🔍 DEBUG - Attempt " .. (retryCount + 1) .. "/" .. maxRetries)
        print("🔍 DEBUG - Calling getNextJobId()...")
        
        local success, nextJobId = pcall(getNextJobId)
        if not success then
            warn("❌ Error calling getNextJobId: " .. tostring(nextJobId))
            nextJobId = nil
        else
            print("✅ getNextJobId() returned: " .. tostring(nextJobId))
        end
        
        if nextJobId then
            print("✅ Got JobId: " .. nextJobId:sub(1, 8) .. "...")
            print("🔍 DEBUG - Calling joinServer()...")
            
            local joinSuccess, joinErr = pcall(function()
                joinServer(nextJobId)
            end)
            
            if not joinSuccess then
                warn("❌ Error calling joinServer: " .. tostring(joinErr))
            else
                print("✅ joinServer() called successfully")
            end
            
            print("🚀 Hop process completed, exiting hopToNext()")
            return -- Thoát vì đã tìm được server
        else
            retryCount = retryCount + 1
            warn("⚠️ Không lấy được JobId mới từ API! Retry " .. retryCount .. "/" .. maxRetries)
            
            if retryCount >= maxRetries then
                warn("❌ Đã thử " .. maxRetries .. " lần nhưng không lấy được JobId!")
                print("🔄 Sẽ thử lại sau 30 giây...")
                task.wait(30)
                retryCount = 0 -- Reset để thử lại
            else
                print("⏳ Waiting 5 seconds before retry...")
                task.wait(5) -- Đợi 5 giây trước khi retry
            end
        end
    end
    
    print("⚠️ hopToNext() finished without successful hop")
end

-- ==========================================
-- ERROR HANDLING
-- ==========================================

-- Xử lý lỗi teleport
TeleportService.TeleportInitFailed:Connect(function(player, result, errorMessage)
    warn("⚠️ Teleport thất bại: " .. tostring(errorMessage))
    
    -- Debug: Check function availability
    print("🔍 DEBUG - brainRequest available: " .. tostring(brainRequest ~= nil))
    print("🔍 DEBUG - hopToNext available: " .. tostring(hopToNext ~= nil))
    print("🔍 DEBUG - currentJobId: " .. tostring(currentJobId))
    
    -- Báo server full (with safety check)
    if brainRequest then
        local success, err = pcall(function()
            brainRequest("/report-full", "POST", { jobId = currentJobId })
        end)
        if not success then
            warn("❌ Error reporting server full: " .. tostring(err))
        end
    else
        warn("❌ brainRequest function not available")
    end
    
    if not stopHop then
        task.wait(2)
        if hopToNext and type(hopToNext) == "function" then
            local success, err = pcall(hopToNext)
            if not success then
                warn("❌ Error calling hopToNext: " .. tostring(err))
            end
        else
            warn("❌ hopToNext function not available or not a function")
        end
    end
end)

-- ==========================================
-- MAIN EXECUTION
-- ==========================================

-- Test HTTP connection first
print("🔍 Testing HTTP connection...")
local testResponse = brainRequest("/status", "GET")
if testResponse then
    print("✅ HTTP connection successful!")
    print("📡 Server response: " .. (testResponse.StatusCode or "Unknown"))
else
    warn("⚠️ HTTP connection failed - continuing anyway...")
end

task.spawn(function()
    print("🕒 Đang chờ game load hoàn tất...")
    if not game:IsLoaded() then game.Loaded:Wait() end
    task.wait(3)

    print("🔍 Bắt đầu scan server...")
    
    -- Báo cáo server age
    reportServerAge()
    
    -- Đợi để game sync
    task.wait(CONFIG.WAIT_TIME_PER_SERVER)
    
    -- Scan tất cả players
    local allPlayers = scanAllPlayers()
    print("👥 Tìm thấy " .. #allPlayers .. " players trong server:")
    for _, p in ipairs(allPlayers) do
        print("  - " .. p.name .. " (" .. p.displayName .. ")")
    end
    
    -- Scan tất cả gangs
    local allGangs = scanAllGangs()
    print("🏴 Tìm thấy " .. #allGangs .. " gangs trong server:")
    for _, g in ipairs(allGangs) do
        print("  - " .. g.name)
    end
    
    -- Báo cáo về Brain Central
    if #allPlayers > 0 then
        reportAllPlayers(allPlayers)
        print("📡 Đã gửi " .. #allPlayers .. " players về API")
    end
    
    if #allGangs > 0 then
        reportAllGangs(allGangs)
        print("📡 Đã gửi " .. #allGangs .. " gangs về API")
    end
    
    -- Print summary data
    printCollectedData()
    
    -- Check Boss/Rift
    local hasBoss, bossInfo = checkBoss()
    local hasRift, riftInfo = checkRift()
    
    -- Báo cáo Boss/Rift về API nếu phát hiện
    if hasBoss then
        brainRequest("/report-boss", "POST", {
            jobId = currentJobId,
            info = bossInfo,
            ageMinutes = math.floor(getServerAge() / 60)
        })
        print("📡 Đã báo cáo Boss server về API")
    end
    
    if hasRift then
        brainRequest("/report-rift", "POST", {
            jobId = currentJobId,
            info = riftInfo,
            ageMinutes = math.floor(getServerAge() / 60)
        })
        print("📡 Đã báo cáo Rift server về API")
    end
    
    -- Debug decision making
    print("\n🔍 DEBUG - Decision Making:")
    print("  - hasBoss: " .. tostring(hasBoss) .. (bossInfo and (" (" .. bossInfo .. ")") or ""))
    print("  - hasRift: " .. tostring(hasRift) .. (riftInfo and (" (" .. riftInfo .. ")") or ""))
    print("  - Players count: " .. #allPlayers)
    print("  - Gangs count: " .. #allGangs)
    print("  - AUTO_HOP: " .. tostring(CONFIG.AUTO_HOP))
    print("  - stopHop: " .. tostring(stopHop))
    
    -- LUÔN AUTO-HOP - Không bao giờ dừng
    print("📝 Server đã quét xong, tiếp tục hop...")
    print("📝 Calling markJobCompleted('completed')...")
    markJobCompleted("completed") 
    print("📝 Waiting 2 seconds before hop...")
    task.wait(2)
    print("📝 Calling hopToNext()...")
    hopToNext()
end)

-- ==========================================
-- UTILITY COMMANDS
-- ==========================================
game:GetService("UserInputService").InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    
    if input.KeyCode == Enum.KeyCode.F1 then
        -- F1: Hiển thị thông tin server
        local secs, timeStr = getServerAge()
        print("=== SERVER INFO ===")
        print("JobId: " .. currentJobId)
        print("Age: " .. timeStr)
        print("Players: " .. #Players:GetPlayers())
        print("Thread: " .. CONFIG.THREAD_ID)
    elseif input.KeyCode == Enum.KeyCode.F2 then
        -- F2: Hop ngay
        if not stopHop and hopToNext then
            print("🚀 Manual hop...")
            markJobCompleted("manual_hop")
            task.wait(0.5)
            hopToNext()
        else
            warn("⚠️ Cannot hop - either stopped or function unavailable")
        end
    elseif input.KeyCode == Enum.KeyCode.F3 then
        -- F3: Dừng/Tiếp tục hop
        stopHop = not stopHop
        print(stopHop and "⏸ Đã dừng auto hop" or "▶ Đã tiếp tục auto hop")
        if not stopHop and hopToNext then
            hopToNext()
        end
    end
end)

print("📋 Phím tắt: F1=Info, F2=Hop ngay, F3=Dừng/Tiếp tục")