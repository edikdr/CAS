-- HAOTICA: горячие клавиши. Переназначаются в «Настройки → Горячие клавиши» (пишут в user.lua).
local M = "SUPER"
local QS = "qs -p /usr/share/haotica/shell ipc call haotica "
local function qs(cmd) return hl.dsp.exec_cmd(QS .. cmd) end
local function run(cmd) return hl.dsp.exec_cmd(cmd) end
local function d(text) return { description = text } end

-- приложения
hl.bind(M .. " + Return",       run("haotica open terminal"), d("Терминал"))
hl.bind(M .. " + E",            run("haotica open files"), d("Файлы"))
hl.bind(M .. " + B",            run("google-chrome-stable"), d("Браузер"))
hl.bind(M .. " + comma",        run("haotica open settings"), d("Настройки"))
hl.bind(M .. " + Space",        qs("launcher toggle"), d("Лаунчер"))
hl.bind(M .. " + A",            qs("haotica toggle"), d("Haotica"))
hl.bind(M .. " + SHIFT + A",    run("haotica open assistant"), d("Haotica — окно"))
hl.bind(M .. " + SHIFT + F23",  qs("haotica toggle"), d("Клавиша Copilot → Haotica"))
hl.bind(M .. " + D",            qs("dashboard toggle"), d("Дашборд"))
hl.bind(M .. " + N",            qs("notifications toggle"), d("Уведомления"))
hl.bind(M .. " + C",            qs("control toggle"), d("Центр управления"))
hl.bind(M .. " + X",            qs("clipboard toggle"), d("История буфера обмена"))
hl.bind(M .. " + Escape",       qs("power toggle"), d("Меню питания"))
hl.bind("XF86PowerOff",         qs("power toggle"), d("Кнопка питания → меню"))
hl.bind(M .. " + L",            qs("lock"), d("Заблокировать"))
hl.bind(M .. " + G",            run("haotica gamemode toggle"), d("Режим «Игра»"))
hl.bind(M .. " + SHIFT + R",    run("systemctl --user restart haotica-shell.service"), d("Перезапустить оболочку"))

-- скриншоты и цвет
hl.bind("Print",                run("haotica screenshot screen"), d("Скриншот экрана"))
hl.bind(M .. " + SHIFT + S",    run("haotica screenshot area"), d("Скриншот области"))
hl.bind(M .. " + SHIFT + W",    run("haotica screenshot window"), d("Скриншот окна"))
hl.bind(M .. " + SHIFT + C",    run("hyprpicker -a -f hex"), d("Пипетка цвета"))
hl.bind(M .. " + ALT + R",      run("haotica record screen"), d("Запись экрана (повтор — стоп)"))
hl.bind(M .. " + SHIFT + Print", run("haotica screenshot area --edit"), d("Скриншот области с разметкой"))

-- окна
hl.bind(M .. " + Q",            hl.dsp.window.close(), d("Закрыть окно"))
hl.bind(M .. " + F",            hl.dsp.window.fullscreen(), d("Во весь экран"))
hl.bind(M .. " + V",            hl.dsp.window.float({ action = "toggle" }), d("Плавающее окно"))
hl.bind(M .. " + J",            hl.dsp.layout("togglesplit"), d("Повернуть разделение"))
hl.bind(M .. " + P",            hl.dsp.window.pin(), d("Поверх всех"))
hl.bind("ALT + Tab",            hl.dsp.window.cycle_next(), d("Следующее окно"))

for _, dir in ipairs({ "left", "right", "up", "down" }) do
    hl.bind(M .. " + " .. dir,            hl.dsp.focus({ direction = dir }))
    hl.bind(M .. " + SHIFT + " .. dir,    hl.dsp.window.move({ direction = dir }))
end

-- рабочие столы
for i = 1, 9 do
    hl.bind(M .. " + " .. i,           hl.dsp.focus({ workspace = i }))
    hl.bind(M .. " + SHIFT + " .. i,   hl.dsp.window.move({ workspace = i }))
end
hl.bind(M .. " + Tab",          hl.dsp.focus({ workspace = "e+1" }), d("Следующий рабочий стол"))
hl.bind(M .. " + SHIFT + Tab",  hl.dsp.focus({ workspace = "e-1" }), d("Предыдущий рабочий стол"))
hl.bind(M .. " + S",            hl.dsp.workspace.toggle_special("scratch"), d("Черновой стол"))
hl.bind(M .. " + CTRL + SHIFT + S", hl.dsp.window.move({ workspace = "special:scratch" }), d("Окно на черновой стол"))
hl.bind(M .. " + mouse_down",   hl.dsp.focus({ workspace = "e+1" }))
hl.bind(M .. " + mouse_up",     hl.dsp.focus({ workspace = "e-1" }))
hl.bind(M .. " + mouse:272",    hl.dsp.window.drag(),   { mouse = true })
hl.bind(M .. " + mouse:273",    hl.dsp.window.resize(), { mouse = true })

-- звук, яркость, медиа (с экранными индикаторами оболочки)
hl.bind("XF86AudioRaiseVolume",  qs("osd volume up"),     { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume",  qs("osd volume down"),   { locked = true, repeating = true })
hl.bind("XF86AudioMute",         qs("osd volume mute"),   { locked = true })
hl.bind("XF86AudioMicMute",      qs("osd mic mute"),      { locked = true })
hl.bind("XF86MonBrightnessUp",   qs("osd brightness up"), { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", qs("osd brightness down"), { locked = true, repeating = true })
hl.bind("XF86AudioNext",         run("playerctl next"),       { locked = true })
hl.bind("XF86AudioPrev",         run("playerctl previous"),   { locked = true })
hl.bind("XF86AudioPlay",         run("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPause",        run("playerctl play-pause"), { locked = true })
hl.bind("XF86KbdBrightnessUp",   run("haotica keyboard brightness up"),   { locked = true })
hl.bind("XF86KbdBrightnessDown", run("haotica keyboard brightness down"), { locked = true })

-- крышка: действие задаётся в «Настройки → Питание» (сон / блокировка / выключить экран / ничего)
hl.bind("switch:on:Lid Switch",  run("haotica lid close"), { locked = true })
hl.bind("switch:off:Lid Switch", run("haotica lid open"),  { locked = true })
