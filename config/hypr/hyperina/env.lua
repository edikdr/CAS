-- HYPERINA: переменные окружения сессии
local s = require("hyperina.settings")

hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_TYPE", "wayland")
hl.env("XDG_SESSION_DESKTOP", "Hyprland")
hl.env("HYPERINA", "1")

hl.env("XCURSOR_THEME", s.cursor_theme)
hl.env("XCURSOR_SIZE", tostring(s.cursor_size))
hl.env("HYPRCURSOR_THEME", s.cursor_theme)
hl.env("HYPRCURSOR_SIZE", tostring(s.cursor_size))

-- Qt: Wayland, тема qt6ct + Kvantum, без собственных рамок окон
hl.env("QT_QPA_PLATFORM", "wayland;xcb")
hl.env("QT_QPA_PLATFORMTHEME", "qt6ct")
hl.env("QT_WAYLAND_DISABLE_WINDOWDECORATION", "1")
hl.env("QT_AUTO_SCREEN_SCALE_FACTOR", "1")

-- GTK, Electron, Chrome, Firefox — нативно в Wayland
hl.env("GDK_BACKEND", "wayland,x11,*")
hl.env("ELECTRON_OZONE_PLATFORM_HINT", "auto")
hl.env("MOZ_ENABLE_WAYLAND", "1")

-- Steam работает через XWayland: масштаб интерфейса задаём ему сами
hl.env("STEAM_FORCE_DESKTOPUI_SCALING", tostring(s.scale))
