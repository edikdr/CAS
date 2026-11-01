-- ┌─ HYPERINA // HYPRLAND ──────────────────────────────────────────┐
-- │ Главный конфиг. Файлы hyperina/* создаёт и обновляет HYPERINA:  │
-- │ цвета и параметры берутся из окна «Настройки».                  │
-- │ Свои правки пишите в user.lua — его установщик не трогает.      │
-- └──────────────────────────────────────────────────────────────────┘

require("hyperina.env")
require("hyperina.monitors")
require("hyperina.look")
require("hyperina.input")
require("hyperina.binds")
require("hyperina.rules")
require("hyperina.autostart")

-- пользовательские дополнения (если файла нет — просто пропускаем)
pcall(require, "user")
