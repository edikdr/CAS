-- HAOTICA: облик — тонкие рамки, свечение люминофора, анимация окон CRT + ГЛИТЧ
local t = require("haotica.theme")
local s = require("haotica.settings")

hl.config({
    general = {
        gaps_in = s.gaps_in,
        gaps_out = s.gaps_out,
        border_size = 1,
        col = {
            active_border = { colors = { t.border_active, t.border_active2 }, angle = 45 },
            inactive_border = t.border_inactive,
        },
        resize_on_border = true,
        extend_border_grab_area = 12,
        hover_icon_on_border = true,
        layout = "dwindle",
        snap = { enabled = true, window_gap = 12, monitor_gap = 12 },
    },

    decoration = {
        rounding = s.window_radius,
        rounding_power = 2,
        active_opacity = 1.0,
        inactive_opacity = 1.0,
        shadow = {
            enabled = true,
            range = 18,
            render_power = 3,
            color = t.shadow_color,
        },
        glow = {
            enabled = s.glow > 0,
            range = math.floor(4 + s.glow * 16),
            render_power = 2,
            color = t.glow_color,
            color_inactive = t.border_inactive,
        },
        blur = {
            enabled = s.blur,
            size = 6,
            passes = 2,
            noise = 0.02,
            vibrancy = 0.12,
            popups = true,
        },
    },

    animations = { enabled = not s.reduce_motion },

    misc = {
        disable_hyprland_logo = true,
        disable_splash_rendering = true,
        force_default_wallpaper = 0,
        background_color = 0x000000,
        focus_on_activate = true,
        key_press_enables_dpms = true,
        mouse_move_enables_dpms = true,
        animate_manual_resizes = false,
        enable_swallow = true,
        swallow_regex = "^(haotica\\.terminal)$",
        allow_session_lock_restore = true,
        middle_click_paste = true,
    },

    dwindle = { preserve_split = true, smart_resizing = true },
    layers = { allow_new_top_layers_over_existing_fullscreen = true },
    xwayland = { force_zero_scaling = true },
    cursor = { inactive_timeout = 0 },
    ecosystem = { no_update_news = true, no_donation_nag = true },
})

-- кривые
hl.curve("hyCrt",    { type = "bezier", points = { {0.2, 0.7},  {0.2, 1}    } })
hl.curve("hyCrtOut", { type = "bezier", points = { {0.6, 0},    {0.4, 1}    } })
hl.curve("hyEase",   { type = "bezier", points = { {0.16, 1},   {0.3, 1}    } })
hl.curve("hyLinear", { type = "bezier", points = { {0, 0},      {1, 1}      } })
hl.curve("hySpring", { type = "spring", mass = 1, stiffness = 260, damping = 26 })

-- скорость в десятых долях секунды; s.window = 0.7 (выбрано: 0.7× от исходной скорости)
local k = 1 / (s.anim_speed * s.window_speed)
local function sp(v) return math.max(1, v * k) end

hl.animation({ leaf = "global",        enabled = true, speed = 6,          bezier = "hyEase" })
hl.animation({ leaf = "border",        enabled = true, speed = 4,          bezier = "hyEase" })
hl.animation({ leaf = "windows",       enabled = true, speed = 4,          spring = "hySpring" })
-- открытие: кинескоп раскрывается из линии (0.42 с × 1/0.7 ≈ 0.6 с; глитч рисует оболочка)
hl.animation({ leaf = "windowsIn",     enabled = true, speed = sp(4.2),    bezier = "hyCrt",    style = "gnomed" })
-- закрытие: схлопывание в линию (0.26 с × 1/0.7 ≈ 0.37 с; сбой сигнала — до начала)
hl.animation({ leaf = "windowsOut",    enabled = true, speed = sp(2.6),    bezier = "hyCrtOut", style = "gnomed" })
hl.animation({ leaf = "windowsMove",   enabled = true, speed = 3,          spring = "hySpring" })
hl.animation({ leaf = "fadeIn",        enabled = true, speed = sp(2.4),    bezier = "hyEase" })
hl.animation({ leaf = "fadeOut",       enabled = true, speed = sp(1.8),    bezier = "hyLinear" })
hl.animation({ leaf = "fade",          enabled = true, speed = 2.5,        bezier = "hyEase" })
hl.animation({ leaf = "layers",        enabled = true, speed = 2.2,        bezier = "hyEase" })
hl.animation({ leaf = "layersIn",      enabled = true, speed = 2.2,        bezier = "hyEase",   style = "fade" })
hl.animation({ leaf = "layersOut",     enabled = true, speed = 1.6,        bezier = "hyLinear", style = "fade" })
hl.animation({ leaf = "workspaces",    enabled = true, speed = 2.5,        bezier = "hyEase",   style = "slidefade 18%" })
hl.animation({ leaf = "specialWorkspace", enabled = true, speed = 2.5,     bezier = "hyEase",   style = "slidevert" })
