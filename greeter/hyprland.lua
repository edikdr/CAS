-- HAOTICA: Hyprland для экрана входа (пользователь greeter). Только оболочка входа, без окон.
hl.monitor({ output = "eDP-1", mode = "2560x1600@165", position = "0x0", scale = 1.6 })
hl.monitor({ output = "", mode = "preferred", position = "auto-right", scale = "auto" })

hl.env("XCURSOR_THEME", "HAOTICA")
hl.env("XCURSOR_SIZE", "24")
hl.env("QT_QPA_PLATFORM", "wayland")
hl.env("QT_WAYLAND_DISABLE_WINDOWDECORATION", "1")

hl.config({
    general = { border_size = 0, gaps_in = 0, gaps_out = 0 },
    decoration = { rounding = 0, shadow = { enabled = false }, blur = { enabled = false } },
    animations = { enabled = true },
    misc = {
        disable_hyprland_logo = true,
        disable_splash_rendering = true,
        force_default_wallpaper = 0,
        background_color = 0x000000,
        key_press_enables_dpms = true,
    },
    input = { kb_layout = "de,ru", kb_options = "grp:alt_shift_toggle", numlock_by_default = true,
              touchpad = { tap_to_click = true, natural_scroll = true } },
    ecosystem = { no_update_news = true, no_donation_nag = true },
})

hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "default", style = "fade" })

hl.on("hyprland.start", function()
    -- когда экран входа запустит сессию пользователя, этот Hyprland закрывается
    hl.exec_cmd("sh -c 'qs -p /usr/share/haotica/greeter; hyprctl dispatch \"hl.dsp.exit()\"'")
end)
