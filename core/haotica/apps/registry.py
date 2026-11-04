"""Реестр собственных приложений HAOTICA: заголовки, размеры, типы файлов.

Из него же установщик создаёт .desktop-файлы, а хост приложений — окна.
app_id окна (Wayland) = haotica-<имя>, как и имя .desktop-файла: так док и Hyprland
узнают приложение, а правила окон в rules.lua находят его по классу.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class App:
    name: str
    ru: str
    en: str
    comment: str
    size: tuple[int, int] = (1100, 720)
    glyph: str = "sparkle"
    category: str = "system"
    multi: bool = False                 # несколько окон в одном процессе (терминал)
    transparent: bool = False           # прозрачный фон окна (размытие Hyprland под ним)
    mime: tuple[str, ...] = ()
    keywords: str = ""
    xdg: str = "Utility;"
    hidden: bool = False                # не показывать в лаунчере (служебные окна)
    perms: tuple[str, ...] = field(default=())   # camera, mic


APPS: dict[str, App] = {a.name: a for a in [
    App("terminal", "Терминал", "Terminal", "Терминал с блоками команд, превью файлов и Haotica", (1320, 820),
        "terminal", "dev", multi=True, keywords="shell;zsh;console;консоль;", xdg="System;TerminalEmulator;"),
    App("files", "Файлы", "Files", "Файлы с превью, тегами и категориями", (1240, 780), "folder", "system",
        mime=("inode/directory",), keywords="folder;explorer;папки;проводник;", xdg="System;FileManager;"),
    App("editor", "Редактор", "Editor", "Текстовый редактор с подсветкой синтаксиса", (1240, 820), "code", "dev",
        mime=("text/plain", "text/markdown", "text/x-python", "application/x-shellscript", "application/json",
              "text/x-csrc", "text/x-c++src", "text/css", "text/html", "application/xml", "application/toml",
              "text/x-lua", "application/javascript", "text/x-log"),
        keywords="text;code;код;текст;", xdg="Development;TextEditor;"),
    App("gallery", "Галерея", "Gallery", "Просмотр изображений и конвертер стиля", (1180, 780), "image", "media",
        mime=("image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp", "image/tiff",
              "image/svg+xml", "image/jxl", "image/heic"), keywords="photo;фото;картинки;", xdg="Graphics;Viewer;"),
    App("docs", "Документы", "Documents", "PDF и EPUB: поиск, закладки, заметки", (1060, 860), "doc", "system",
        mime=("application/pdf", "application/epub+zip"), keywords="pdf;epub;книги;", xdg="Office;Viewer;"),
    App("player", "Плеер", "Player", "Видео и музыка", (1120, 700), "play", "media",
        mime=("video/mp4", "video/x-matroska", "video/webm", "video/quicktime", "audio/mpeg", "audio/flac",
              "audio/ogg", "audio/x-wav", "audio/mp4"), keywords="video;music;видео;музыка;", xdg="AudioVideo;Player;"),
    App("calculator", "Калькулятор", "Calculator", "Обычный, инженерный и для программиста; единицы и валюты",
        (420, 640), "calc", "system", keywords="calc;math;счёт;", xdg="Utility;Calculator;"),
    App("calendar", "Календарь", "Calendar", "Месяц, неделя, повестка; Google и CalDAV", (1140, 760), "calendar",
        "system", keywords="events;события;встречи;", xdg="Office;Calendar;"),
    App("clock", "Часы", "Clock", "Будильник, таймер, секундомер, мировое время", (520, 640), "clock", "system",
        keywords="alarm;timer;будильник;таймер;", xdg="Utility;Clock;"),
    App("weather", "Погода", "Weather", "Сейчас и на 7 дней, радар осадков", (920, 660), "weather", "system",
        keywords="forecast;прогноз;", xdg="Utility;"),
    App("notes", "Заметки", "Notes", "Markdown-заметки в ~/Notes, совместимо с Obsidian", (1080, 720), "notes", "chat",
        keywords="markdown;записи;", xdg="Office;"),
    App("sysmon", "Монитор системы", "System Monitor", "Процессы, CPU, GPU, GTT, температуры, режимы Legion",
        (1160, 760), "sysmon", "system", keywords="process;task manager;процессы;", xdg="System;Monitor;"),
    App("screenshot", "Скриншоты", "Screenshots", "Скриншоты, разметка и запись экрана", (1120, 760), "camera",
        "media", keywords="capture;снимок;", xdg="Graphics;"),
    App("clipboard", "Буфер обмена", "Clipboard", "История буфера с поиском и закреплением", (540, 680),
        "clipboard", "system", keywords="copy;paste;копировать;", xdg="Utility;"),
    App("colorpicker", "Пипетка", "Color Picker", "Цвет с экрана, палитры", (440, 560), "picker", "media",
        keywords="color;цвет;", xdg="Graphics;"),
    App("archives", "Архивы", "Archives", "Просмотр и распаковка архивов", (960, 640), "archive", "system",
        mime=("application/zip", "application/x-tar", "application/gzip", "application/x-xz", "application/zstd",
              "application/x-7z-compressed", "application/vnd.rar", "application/x-bzip2"),
        keywords="zip;rar;7z;архив;", xdg="Utility;Archiving;"),
    App("disks", "Диски", "Disks", "Разделы, SMART, форматирование", (1040, 700), "disk", "system",
        keywords="partition;smart;раздел;", xdg="System;"),
    App("store", "Магазин", "Store", "Программы из репозиториев, AUR и Flatpak; сайты как приложения", (1160, 780),
        "store", "social", keywords="install;packages;установка;пакеты;", xdg="System;PackageManager;"),
    App("settings", "Настройки", "Settings", "Все настройки HAOTICA", (1220, 800), "settings", "system",
        keywords="preferences;config;параметры;", xdg="Settings;", perms=("camera",)),
    App("assistant", "Haotica", "Haotica", "Ассистент Haotica: чат, файлы, сеть, изображения", (540, 900), "haotica",
        "ai", transparent=True, keywords="ai;assistant;ии;ассистент;", xdg="Utility;"),
    App("netrecon", "Network Recon", "Network Recon", "Устройства вашей сети и управление роутером", (1240, 800),
        "radar", "system", keywords="wifi;network;router;сеть;роутер;", xdg="Network;"),
    App("cloud", "Cloud Link", "Cloud Link", "Облачные модели OpenRouter: ключ, модель, бюджет", (980, 760),
        "cloud", "ai", keywords="openrouter;cloud;облако;", xdg="Network;"),
    App("portrait", "Портрет Haotica", "Haotica portrait", "Служебное: экспорт портрета для оболочки", (7 * 480, 520),
        "haotica", "ai", transparent=True, hidden=True),
    App("updates", "Обновления", "Updates", "Обновления системы, AUR и Flatpak", (900, 640), "download", "system",
        keywords="upgrade;обновить;", xdg="System;", hidden=True),
    App("keybinds", "Клавиши", "Keybinds", "Билдер клавиш и раскладка ISO-DE QWERTZ", (1120, 740),
        "keyboard", "system", keywords="keys;shortcuts;hyprland;хоткеи;клавиши;", xdg="Settings;"),
    App("browser", "Браузер (Щит)", "Browser Shield", "Статус щита uBlock Origin и профиль Sparkasse", (1160, 760),
        "globe", "system", keywords="chrome;adblock;ublock;браузер;", xdg="Network;WebBrowser;"),
]}


def get(name: str) -> App | None:
    return APPS.get(name.removeprefix("haotica-"))
