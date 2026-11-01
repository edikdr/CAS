-- HAOTICA: клавиатура QWERTZ (de + ru), тачпад, жесты
local s = require("haotica.settings")

hl.config({
    input = {
        kb_layout = s.kb_layout,
        kb_variant = s.kb_variant,
        kb_options = s.kb_options,
        numlock_by_default = true,
        repeat_delay = s.repeat_delay,
        repeat_rate = s.repeat_rate,
        follow_mouse = 1,
        sensitivity = s.sensitivity,
        accel_profile = "adaptive",
        touchpad = {
            natural_scroll = s.natural_scroll,
            tap_to_click = s.tap_to_click,
            disable_while_typing = s.disable_while_typing,
            clickfinger_behavior = true,
            scroll_factor = 0.7,
            drag_lock = 0,
        },
    },
    gestures = {
        workspace_swipe_distance = 320,
        workspace_swipe_cancel_ratio = 0.3,
        workspace_swipe_create_new = false,
    },
    binds = {
        workspace_back_and_forth = true,
        allow_workspace_cycles = true,
    },
})

-- три пальца влево/вправо — рабочие столы, вверх — дашборд, вниз — свернуть дашборд
hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })
hl.gesture({ fingers = 3, direction = "up", action = function() hl.exec_cmd("qs -p /usr/share/haotica/shell ipc call haotica dashboard open") end })
hl.gesture({ fingers = 3, direction = "down", action = function() hl.exec_cmd("qs -p /usr/share/haotica/shell ipc call haotica dashboard close") end })
