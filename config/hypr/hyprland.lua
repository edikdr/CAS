-- ┌─ HAOTICA // HYPRLAND ──────────────────────────────────────────┐
-- │ Главный конфиг. Файлы haotica/* создаёт и обновляет HAOTICA:  │
-- │ цвета и параметры берутся из окна «Настройки».                  │
-- │ Свои правки пишите в user.lua — его установщик не трогает.      │
-- └──────────────────────────────────────────────────────────────────┘

require("haotica.env")
require("haotica.monitors")
require("haotica.look")
require("haotica.input")
require("haotica.binds")
require("haotica.rules")
require("haotica.autostart")

-- пользовательские дополнения (если файла нет — просто пропускаем)
pcall(require, "user")
