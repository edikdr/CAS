# HAOTICA OS — Приложения и дополнения ветки `gemini-apps`

Ветка `gemini-apps` создана поверх `hyprina-os` без перезаписи существующих приложений (`terminal`, `files`, `settings`, `sysmon`, `assistant`, `portrait`).

## 1. Добавленные приложения (`apps/<имя>/index.html`)
Каждое приложение использует общий UI-кит `/ui/hy.css` и ES-модуль `/ui/hy.js` (`import { HY } from "/ui/hy.js"`), подключается к окну QtWebEngine (`core/haotica/apps/host.py`) через `window.hy` (`QWebChannel`) и зарегистрировано в `core/haotica/apps/registry.py`:

- `apps/weather/index.html` — **Погода** (`haotica-app weather`): текущая сводка, почасовой прогноз на 24ч, таблица на 7 дней, доплеровский радар осадков.
- `apps/docs/index.html` — **Документы** (`haotica-app docs`): редактор и просмотрщик досье/Markdown со встроенным локальным ИИ (`Qwen3.8-27B` / `Coder-Next 80B`) и карточками `[TAB] Принять / [ESC] Отклонить`.
- `apps/editor/index.html` — **Редактор кода** (`haotica-app editor`): дерево проекта, символы AST, телеметрия CPU/GPU/GTT, теневое автодополнение `Qwen3-1.7B` по `[TAB]`, переключатель `BASE (27B)` ⇄ `DEEP (80B)` и дифф-карточки `[TAB]/[ESC]`.
- `apps/keybinds/index.html` — **Билдер клавиш** (`haotica-app keybinds`): интерактивная матрица клавиатуры Lenovo Legion `ISO-DE QWERTZ` (105 клавиш: `strg`, `fn`, `alt gr`, `Z/Y`, `Ü/Ö/Ä/ß`, `< > |`, `einfg/druck/entf`) и экспорт биндов в Hyprland.
- `apps/browser/index.html` — **Браузер (Щит)** (`haotica-app browser`): панель управления предустановленным `uBlock Origin` и изолированным банковским профилем `Sparkasse`.
- `apps/netrecon/index.html` — **Network Recon** (`haotica-app netrecon`): 3D-радар локальной сети и карточка автоподключения к роутеру `Vodafone-D37C` (`192.168.0.1`, все секреты берутся через `libsecret`, в коде паролей нет).
- `apps/notes/index.html` — **Заметки** (`haotica-app notes`): Markdown-заметки `~/Notes` (совместимо с Obsidian) + граф связей `[[wiki-links]]`.
- `apps/calculator/index.html` — **Калькулятор** (`haotica-app calculator`): инженерный и программистский (`HEX/DEC/OCT/BIN`).
- `apps/calendar/index.html` — **Календарь** (`haotica-app calendar`): сетка месяца и расписание.
- `apps/clock/index.html` — **Часы** (`haotica-app clock`): мировое время, сегментный таймер и секундомер.
- `apps/player/index.html` — **Плеер** (`haotica-app player`): аудио/видео плеер с анализатором спектра FFT.
- `apps/gallery/index.html` — **Галерея** (`haotica-app gallery`): просмотр изображений и конвертер под палитры Haotica.
- `apps/cloud/index.html` — **Cloud Link** (`haotica-app cloud`): настройка облачного моста OpenRouter и дневных лимитов бюджета.
- `apps/disks/index.html` — **Диски** (`haotica-app disks`): карта блоков Btrfs и SMART-досье NVMe.
- `apps/archives/index.html` — **Архивы** (`haotica-app archives`): инспектор и распаковка `.tar.zst`, `.zip`, `.7z`.
- `apps/store/index.html` — **Магазин** (`haotica-app store`): пакеты `pacman`, `AUR`, `Flatpak`.
- `apps/clipboard/index.html` — **Буфер обмена** (`haotica-app clipboard`): история `cliphist` с закреплением.
- `apps/colorpicker/index.html` — **Пипетка** (`haotica-app colorpicker`): выбор цвета и токены палитр.
- `apps/screenshot/index.html` — **Скриншоты** (`haotica-app screenshot`): захват области экрана + распознавание текста Vision OCR.

## 2. Как запускаются приложения в HAOTICA
1. Через хост приложений QtWebEngine:
   ```bash
   haotica-app weather
   haotica-app editor
   haotica-app docs
   haotica-app keybinds
   ```
2. Генерация `.desktop`-файлов (выполняется модулем `modules/40-apps.sh` или вручную):
   ```bash
   haotica desktop --dest /usr/share/applications --apps /usr/share/haotica/apps --mimeapps /etc/xdg/mimeapps.list
   ```

## 3. Персона владельца (Eduard / Едуард) и системные политики
- `core/haotica/agent/persona.py` и `shell/lock/LockScreen.qml`: владелец — **Eduard / Едуард** (вежливое приветствие по имени; при неудачном скане лица постороннего — ответ жалобным и недовольным тоном: *«Ты не Едуард, киш отсюда»*).
- `system/etc/opt/chrome/policies/managed/haotica-adblock.json`: политика Chrome для автоматической установки `uBlock Origin` и `uBlock Origin Lite`.
- `system/etc/hypr/input-de-qwertz.conf`: раскладка `de,ru` (`pc105`, `ISO-DE QWERTZ`).
- `system/etc/NetworkManager/system-connections/Vodafone-D37C.nmconnection`: шаблон автоподключения к `Vodafone-D37C` (`psk-flags=1`, без паролей в коде).
