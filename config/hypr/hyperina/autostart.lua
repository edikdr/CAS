-- HYPERINA: запуск сессии
hl.on("hyprland.start", function()
    -- передать окружение сессии в systemd/D-Bus, затем поднять сервисы HYPERINA
    hl.exec_cmd("dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP XDG_SESSION_TYPE HYPRLAND_INSTANCE_SIGNATURE DISPLAY XCURSOR_THEME XCURSOR_SIZE QT_QPA_PLATFORMTHEME")
    hl.exec_cmd("systemctl --user start hyperina-session.target")
    hl.exec_cmd("wl-paste --type text --watch cliphist store")
    hl.exec_cmd("wl-paste --type image --watch cliphist store")
end)

hl.on("hyprland.shutdown", function()
    hl.exec_cmd("systemctl --user stop hyperina-session.target")
end)
