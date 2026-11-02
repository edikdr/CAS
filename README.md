# HAOTICA OS

Arch Linux + Hyprland + Quickshell + локальный ассистент **Haotica** для Lenovo Legion 7 15ASH11
(Ryzen AI Max+ 392, Radeon 8060S, 64 ГБ). Стиль — кибер-ретро: OLED-чёрный, янтарь/бирюза/фиолет, CRT.

## Установка

1. Поставьте чистый Arch Linux (archinstall: профиль *minimal*, загрузчик systemd-boot или GRUB,
   сеть NetworkManager, пользователь с sudo). Войдите в консоль своим пользователем.
2. Скопируйте папку `hyprina-os` (или `haotica-installer.run`) и запустите:
   ```bash
   ./install.sh --yes            # или: sh haotica-installer.run --yes
   ```
   Пароль sudo спросят один раз. Прервалось — запустите снова, продолжит с места сбоя.
   `--dry-run` — только показать шаги, `--no-models` — без моделей ИИ (~70 ГБ), `--list` — состояние модулей.
3. Перезагрузитесь: экран входа HAOTICA → ваш пароль → рабочий стол.

## Первый запуск

- Модели Haotica качаются в фоне (`haotica models status`, Настройки → Haotica → Файлы моделей).
  Пока база не скачана, Haotica честно пишет «модель ещё загружается N%».
- `haotica doctor` — проверка служб, портов, GPU, звука и моделей.
- Ключ OpenRouter (облачные помощники) — Настройки → Haotica → Облако; хранится в связке ключей.

## Клавиши

| | |
|---|---|
| Super+Enter | терминал | 
| Super+Space | лаунчер |
| Super+A / Super+Shift+A | панель Haotica / окно Haotica |
| Super+, | настройки |
| Super+E | файлы |
| Super+G | режим «Игра» (выгружает модели, снимает эффекты) |
| Print / Super+Shift+S | скриншот экрана / области |

В терминале: `hy вопрос` или `?? вопрос` — спросить Haotica; карточки команд: **[TAB]** принять, **[ESC]** отклонить.

Свои правки Hyprland — в `~/.config/hypr/user.lua` (установщик его не трогает).
