# HAOTICA Терминал для Ubuntu

Терминал HAOTICA (блоки команд, CRT, превью файлов) и локальный ИИ **Haotica** на обычной Ubuntu.
Рабочий стол не меняется: GNOME остаётся, всё ставится в `~/.local`, системные пакеты — через `apt`.

## Установка

```bash
sudo apt update && sudo apt install -y git
git clone -b terminal-ubuntu https://github.com/edikdr/CAS.git
cd CAS
bash ubuntu/install.sh
```

Занимает 30–60 минут (PySide6, сборка `llama.cpp`), модели ИИ качаются потом в фоне (около 25 ГБ: base и fast).
Параметры: `--no-models`, `--with-deep` (+ большая модель deep), `--no-llama`, `--no-apt`, `--dry-run`, `-h`.
Повторный запуск безопасен.

## Запуск

- Меню приложений → **«HAOTICA Терминал»**, или в консоли: `haotica-term`.
- Haotica: строка **Ask Haotica** в терминале или `hy привет` в любой консоли.
- Прогресс моделей: `haotica models status`. Проверка системы: `haotica doctor`.
- Ключ OpenRouter (облачные помощники): Ctrl+Shift+P → `/key` или `haotica key set openrouter`.

## Что где лежит

| | |
|---|---|
| Программа | `~/.local/share/haotica-terminal/{app,venv,opt}` |
| Команды | `~/.local/bin/haotica*` |
| Службы | `~/.config/systemd/user/haotica-*.service` (`core`, `agent` — при входе; модели запускает Haotica) |
| Настройки, память, модели | `~/.config/haotica`, `~/.local/share/haotica` |

## Удаление

```bash
bash ubuntu/uninstall.sh            # программа и службы; модели и память остаются
bash ubuntu/uninstall.sh --purge    # и модели, и настройки
```

## Замечания

- Песочница Chromium внутри QtWebEngine отключена (Ubuntu запрещает её без профиля AppArmor): окна открывают только локальные страницы `127.0.0.1`.
- Нужна видеокарта с Vulkan (для Radeon 8060S — `mesa-vulkan-drivers`, ставится автоматически). Без Vulkan модели будут работать очень медленно.
- Не входит в эту ветку: Hyprland, оболочка Quickshell, экран входа, голос Сары (они есть в ветке `hyprina-os`).
