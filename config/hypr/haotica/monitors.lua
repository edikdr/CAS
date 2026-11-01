-- HAOTICA: экран Legion 7 (OLED 2560×1600, 165 Гц, HDR True Black 1000) и внешние мониторы
local s = require("haotica.settings")

local panel = {
    output   = "eDP-1",
    mode     = "2560x1600@" .. tostring(s.refresh),
    position = "0x0",
    scale    = s.scale,
    bitdepth = s.bitdepth,
    -- VRR только в полноэкранных играх и видео: на OLED это убирает мерцание на рабочем столе
    vrr      = s.vrr and 2 or 0,
}
if s.hdr then panel.cm = "hdr" end
hl.monitor(panel)

-- любые внешние мониторы: родное разрешение справа от ноутбука
hl.monitor({ output = "", mode = "preferred", position = "auto-right", scale = "auto" })
