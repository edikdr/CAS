-- HAOTICA: правила окон и слоёв оболочки

-- приложения HAOTICA: маленькие — плавающими окнами
for _, app in ipairs({ "calculator", "colorpicker", "clock", "weather", "clipboard", "cloud", "power" }) do
    hl.window_rule({ name = "hy-float-" .. app, match = { class = "^haotica-" .. app .. "$" }, float = true, center = true })
end
hl.window_rule({ name = "hy-calc-size", match = { class = "^haotica-calculator$" }, size = "420 640" })

-- окно Haotica — справа, во всю высоту
hl.window_rule({
    name = "hy-haotica",
    match = { class = "^haotica-assistant$" },
    float = true,
    size = "540 monitor_h-96",
    move = "monitor_w-564 64",
})

-- диалоги выбора файлов и окна аутентификации
hl.window_rule({ name = "hy-dialogs", match = { title = "^(Open File|Save File|Открыть файл|Сохранить файл|Select|Выбор).*" }, float = true, center = true })
hl.window_rule({ name = "hy-portal", match = { class = "^(xdg-desktop-portal-gtk|org\\.freedesktop\\.impl\\.portal\\..*)$" }, float = true, center = true })

-- «картинка в картинке» — поверх всех в углу
hl.window_rule({ name = "hy-pip", match = { title = "^(Picture-in-Picture|Картинка в картинке)$" }, float = true, pin = true, size = "480 270", move = "monitor_w-504 monitor_h-300" })

-- Steam: друзья и всплывающие окна — плавающими
hl.window_rule({ name = "hy-steam-friends", match = { class = "^steam$", title = "^(Friends List|Список друзей)$" }, float = true })

-- игнорировать запросы «развернуть» от приложений (порядок окон задаём мы)
hl.window_rule({ name = "hy-suppress-maximize", match = { class = ".*" }, suppress_event = "maximize" })

-- исправление перетаскивания в XWayland
hl.window_rule({
    name = "hy-fix-xwayland-drags",
    match = { class = "^$", title = "^$", xwayland = true, float = true, fullscreen = false, pin = false },
    no_focus = true,
})

-- слои оболочки: свои анимации у Quickshell, размытие под полупрозрачными панелями
hl.layer_rule({ name = "hy-wall",    match = { namespace = "^haotica-wallpaper$" }, no_anim = true })
hl.layer_rule({ name = "hy-overlay", match = { namespace = "^haotica-(overlay|glitch|hud)$" }, no_anim = true })
hl.layer_rule({ name = "hy-blur",    match = { namespace = "^haotica-(bar|dock|launcher|notifications|control|dashboard|haotica|osd)$" }, blur = true, ignore_alpha = 0.35 })
hl.layer_rule({ name = "hy-dim",     match = { namespace = "^haotica-(launcher|power)$" }, dim_around = true })
