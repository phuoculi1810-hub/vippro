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
print("👤 Người chơi: " .. LocalPlayer.Name)
print("🔗 Thread ID: " .. CONFIG.THREAD_ID)
print("🌍 Current JobId: " .. currentJobId:sub(1, 8) .. "...")
print("📡 Brain URL: " .. CONFIG.BRAIN_URL)

-- Test HTTP connection
print("🔍 Testing HTTP connection...")
local testResponse = brainRequest("/status", "GET")
if testResponse then
    print("✅ HTTP connection successful!")
    print("📡 Server response: " .. (testResponse.StatusCode or "Unknown"))
else
    warn("⚠️ HTTP connection failed - continuing anyway...")
end

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
    return (syn and syn.request) or (http and http.request) or http_request or request
end

local function brainRequest(path, method, body)
    local req = getRequest()
    if not req then return nil end
    local ok, response = pcall(function()
        return req({
            Url = CONFIG.BRAIN_URL .. path,
            Method = method or "GET",
            Headers = {["Content-Type"] = "application/json"},
            Body = body and HttpService:JSONEncode(body) or nil
        })
    end)
    if ok then return response end
    return nil
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
    print("📝 Marking JobId completed: " .. tostring(result))
    local response = brainRequest("/complete", "POST", {
        jobId = currentJobId,
        result = result or "completed"
    })
    if response then
        print("✅ JobId marked as completed")
    else
        print("❌ Failed to mark JobId as completed")
    end
end

-- Lấy JobId tiếp theo từ API
local function getNextJobId()
    print("📞 Đang lấy JobId tiếp theo từ API (Thread: " .. CONFIG.THREAD_ID .. ")...")
    local response = brainRequest("/next/" .. CONFIG.THREAD_ID, "GET")
    if response and response.Body and response.Body ~= "NONE" then
        local jobId = response.Body:gsub("%s+", "")
        print("✅ Lấy được JobId: " .. jobId:sub(1, 8) .. "...")
        return jobId
    else
        print("❌ Không lấy được JobId từ API")
        if response then
            print("Response Body: " .. tostring(response.Body))
        else
            print("No response from API")
        end
        return nil
    end
end

-- Join server bằng JobId
local function joinServer(jobId)
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
        brainRequest("/report-full", "POST", { jobId = jobId })
        task.wait(2)
        if hopToNext then -- Check if function exists
            hopToNext() -- Retry với server khác
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
    local h = math.floor(minutes / 60)
    local m = minutes % 60
    
    -- Boss spawn mỗi 2 giờ tại phút 55
    if (h % 2 ~= 0 and m >= 55) then
        print("🔥 BOSS DETECTED: Server age " .. timeStr .. " - Boss sắp spawn!")
        return true
    end
    return false
end

local function checkRift()
    local secs, timeStr = getServerAge()
    local minutes = math.floor(secs / 60)
    
    -- Rift spawn mỗi 90 phút
    local cycle = math.floor((minutes + 10) / 90)
    if cycle > 0 then
        local spawnTime = cycle * 90
        if minutes >= spawnTime - 10 and minutes <= spawnTime + 10 then
            print("🌀 RIFT DETECTED: Server age " .. timeStr .. " - Rift active!")
            return true
        end
    end
    return false
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
    if stopHop then
        print("⏸ Server hopping đã bị dừng")
        return
    end
    
    local retryCount = 0
    local maxRetries = 5
    
    while retryCount < maxRetries do
        local nextJobId = getNextJobId()
        if nextJobId then
            print("📞 Lấy được JobId mới: " .. nextJobId:sub(1, 8) .. "...")
            joinServer(nextJobId)
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
                task.wait(5) -- Đợi 5 giây trước khi retry
            end
        end
    end
end

-- ==========================================
-- ERROR HANDLING
-- ==========================================

-- Xử lý lỗi teleport
TeleportService.TeleportInitFailed:Connect(function(player, result, errorMessage)
    warn("⚠️ Teleport thất bại: " .. tostring(errorMessage))
    
    -- Báo server full
    brainRequest("/report-full", "POST", { jobId = currentJobId })
    
    if not stopHop then
        task.wait(2)
        hopToNext()
    end
end)

-- ==========================================
-- MAIN EXECUTION
-- ==========================================
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
    local hasBoss = checkBoss()
    local hasRift = checkRift()
    
    -- Quyết định có dừng lại không
    local shouldStop = hasBoss or hasRift or #allPlayers >= 15 or #allGangs >= 3
    
    if shouldStop then
        stopHop = true
        local reason = ""
        if hasBoss then reason = reason .. "Boss " end
        if hasRift then reason = reason .. "Rift " end
        if #allPlayers >= 15 then reason = reason .. "ManyPlayers(" .. #allPlayers .. ") " end
        if #allGangs >= 3 then reason = reason .. "ManyGangs(" .. #allGangs .. ") " end
        
        print("🛑 DỪNG HOP - Lý do: " .. reason)
        markJobCompleted("interesting_server")
        showNextButton()
        return
    end
    
    -- Tiếp tục hop nếu auto hop enabled
    if CONFIG.AUTO_HOP and not stopHop then
        print("📝 Server bình thường, tiếp tục hop...")
        markJobCompleted("normal_server") 
        task.wait(2) -- Tăng thời gian chờ
        hopToNext()
    else
        print("🛑 Auto hop bị tắt hoặc đã dừng")
        showNextButton()
    end
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