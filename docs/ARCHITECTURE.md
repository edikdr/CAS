# HAOTICA — архитектура и соглашения

Документ-контракт: пути, сервисы, порты и форматы данных, общие для всех частей системы.

## Слои

| Слой | Технология | Где лежит |
|---|---|---|
| Установщик | bash (`install.sh`, `lib/`, `modules/`) | репозиторий |
| Композитор | Hyprland 0.57+ (конфиг на **Lua**) | `config/hypr/` → `~/.config/hypr/` |
| Оболочка | Quickshell 0.3+ (QML) | `shell/` → `/usr/share/haotica/shell` |
| Экран входа | greetd + Hyprland + Quickshell | `greeter/` → `/usr/share/haotica/greeter` |
| Ядро | Python 3 (aiohttp), сервис `haotica-core` | `core/haotica` → `/usr/lib/haotica/python` |
| Haotica | Python, сервис `haotica` | `core/haotica/ai` |
| Приложения | PySide6 QtWebEngine + HTML/CSS/JS | `apps/` → `/usr/share/haotica/apps` |
| Модели | llama.cpp (Vulkan), Chatterbox TTS (ROCm gfx1151) | `/opt/haotica` |
| Привилегированные действия | `haotica-helper` через polkit | `core/haotica/helper` |

## Пути

| Что | Путь |
|---|---|
| Код Python | `/usr/lib/haotica/python/haotica` |
| Общие ресурсы | `/usr/share/haotica/{shell,greeter,apps,assets,sounds,wallpapers}` |
| Системный конфиг | `/etc/haotica/` |
| Тяжёлые компоненты | `/opt/haotica/{venv,tts-venv,gesture-venv,llama.cpp,bin}` |
| Настройки пользователя | `~/.config/haotica/settings.toml` |
| Данные пользователя | `~/.local/share/haotica/` (модели: `models/`, память Haotica: `memory.db`) |
| Состояние | `~/.local/state/haotica/` (токен API: `token`, журналы) |
| Рантайм | `$XDG_RUNTIME_DIR/haotica/` (живые JSON для оболочки) |
| Журнал установки | `/var/log/haotica/install.log` |

## Сервисы (systemd --user, если не указано иное)

| Юнит | Что делает | Адрес |
|---|---|---|
| `haotica-core.service` | API ядра, метрики, настройки, файлы, сеть, роутер, звуки | `127.0.0.1:47800` |
| `haotica.service` | Haotica: чат, инструменты, облако, память | `127.0.0.1:47810` |
| `haotica-llm-main.service` | llama-server, основная модель | `127.0.0.1:47821` |
| `haotica-llm-fast.service` | llama-server, модель подсказок | `127.0.0.1:47822` |
| `haotica-llm-vision.service` | llama-server, зрение (по требованию) | `127.0.0.1:47823` |
| `haotica-tts.service` | синтез речи голосом Сары | `127.0.0.1:47830` |
| `haotica-searxng.service` | локальный метапоиск (podman) | `127.0.0.1:47840` |
| `haotica-apps.service` | хост окон приложений (QtWebEngine) | сокет `$XDG_RUNTIME_DIR/haotica/apps.sock` |
| `haotica-gestures.service` | жесты камеры (MediaPipe), по умолчанию выключен | — |
| `haotica-helper` (системный, D-Bus/polkit) | привилегированные действия по белому списку | `pkexec /usr/lib/haotica/bin/haotica-helper` |

Все HTTP-адреса слушают только `127.0.0.1`. Каждый запрос несёт заголовок `X-Haotica-Token` со значением из `~/.local/state/haotica/token` (права 0600).

## Живые данные для оболочки

Ядро пишет атомарно (через временный файл и `rename`) в `$XDG_RUNTIME_DIR/haotica/`:

| Файл | Частота | Содержимое |
|---|---|---|
| `theme.json` | при изменении | цвета активного профиля, шрифты, эффекты |
| `settings.json` | при изменении | развёрнутые настройки (то, что нужно оболочке) |
| `metrics.json` | 1 с | CPU, GPU, GTT, RAM, температуры, вентиляторы, батарея, сеть, режим питания |
| `haotica.json` | при изменении | состояние Haotica (`idle`/`reading`/`thinking`/`speaking`/`warning`/`happy`/`sleep`), последняя реплика, `cloud_assist` |
| `events.json` | при событии | последние события для HUD-лога |

Оболочка читает их через `FileView { watchChanges: true }`. В обратную сторону оболочка шлёт запросы в API ядра (`XMLHttpRequest` с токеном). Ядро управляет оболочкой через `qs ipc call haotica <функция>`.

## Формат настроек

`settings.toml` — единственный источник правды, разделы совпадают с разделами окна «Настройки» (§13 DESIGN.md). Значения по умолчанию лежат в `core/haotica/defaults.toml`. Неизвестные ключи сохраняются как есть.

## Палитра

`assets/palette.toml` содержит базовые токены и 7 профилей (`MIX`, `HYPERION`, `SUBJECT`, `ESCAPE`, `ARCH`, `RIDER`, `SPACE`). Генератор `haotica theme apply` пересобирает темы всех целей: оболочки, Hyprland, GTK, Qt/Kvantum, терминала, Chrome и приложений.

## Модули установщика

Каждый файл `modules/NN-имя.sh` объявляет функции `mod_NN_describe` и `mod_NN_run`. Повторный запуск безопасен. Успешно выполненные модули записываются в `/var/lib/haotica/install.state` и при повторе пропускаются (кроме `--force`). Любое действие можно посмотреть без выполнения: `--dry-run`.
