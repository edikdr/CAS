# HAOTICA Terminal — инвентаризация интерфейса (W1, T-10…T-17)

Эталон поведения — Windows Terminal / Alacritty. Итог M2–M8 (ветка `terminal-windows`): строк «не работает» нет;
автотесты — `tests/ui/terminal.spec.mjs` (24 сценария), `tests/ui/chat.spec.mjs` (7), `tests/py/*` (≈95), прогон на
Windows — CI `.github/workflows/terminal-windows.yml`. «ручн.» — проверить руками на ноутбуке (IME, мёртвые клавиши,
мышь в TUI, vttest, кодеки видео). Статус: **OK** — работает; **BUG** — есть, но работает неправильно
(особенно на Windows); **NO** — нет. Колонка «Тест» — где проверяется (`pw:` — Playwright `tests/ui/terminal.spec.mjs`,
`py:` — pytest, `ручн.` — вручную на Windows). Состояние «до» — по коду ветки `hyprina-os`; «после» — после M2.

## 1. Окно и шапка
| ID | Элемент / клавиша | Ожидаемое поведение | До | После | Тест |
|---|---|---|---|---|---|
| UI-01 | Перетаскивание за шапку (`#drag1`, `#drag2`) | системное перемещение окна (`startSystemMove`) | OK | OK | ручн. |
| UI-02 | Двойной клик по шапке | развернуть/восстановить | BUG (`hyprctl`) | OK (`showMaximized/showNormal`) | ручн. |
| UI-03 | Кнопка «свернуть» | свернуть в панель задач | BUG (`hyprctl`) | OK (`showMinimized`) | ручн. |
| UI-04 | Кнопка «развернуть» | развернуть/восстановить | BUG (`hyprctl`) | OK | ручн. |
| UI-05 | Кнопка «закрыть» / Alt+F4 | закрыть окно; если в вкладках идут процессы — подтверждение; все дочерние процессы завершаются | BUG (без подтверждения) | OK | pw:close-confirm, py:supervisor |
| UI-06 | Края окна (ресайз) | системный ресайз со всех сторон и углов | OK | OK | ручн. |
| UI-07 | F11 | полноэкранный режим | BUG (`hyprctl`) | OK (`showFullScreen`) | pw:keys |
| UI-08 | «Всегда сверху» (палитра) | `WindowStaysOnTopHint` вкл/выкл | NO | OK | ручн. |
| UI-09 | Кнопка Cloud Link (облако) | раньше — модальное окно ключей; теперь — фокус на поле ключа в панели HAOTICA (W4) | BUG (модальное) | OK | pw:key-inline |
| UI-10 | Кнопка палитры (лупа) / Ctrl+Shift+P | палитра команд с поиском, ↑/↓, Enter, Esc | OK | OK | pw:palette |
| UI-11 | Заголовок окна | `TITLE // HAOTICA`, при OSC 0/2 — заголовок активной вкладки | BUG (только вкладка) | OK | pw:osc-title |

## 2. Ввод (T-10)
| ID | Клавиша | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-20 | Любые печатные символы, кириллица | уходят в оболочку как UTF-8 | OK | OK | pw:input |
| UI-21 | AltGr (нем. раскладка): `@ € ~ \| [ ] { } \` | символ уходит в оболочку, ни одно сочетание терминала не перехватывает AltGr (Ctrl+Alt в Chromium) | BUG (Ctrl+Alt+цифра/B перехватывались без проверки AltGraph) | OK | pw:altgr |
| UI-22 | «Мёртвые» клавиши `^ ´ \`` и IME | композиция через textarea xterm | OK | OK | ручн. |
| UI-23 | Ctrl+буква, Alt+буква | управляющие коды / ESC-префикс | OK | OK | pw:ctrl-alt |
| UI-24 | F1–F12, Home/End/PgUp/PgDn/Ins/Del, стрелки с модификаторами | стандартные последовательности xterm | OK | OK | pw:fkeys |
| UI-25 | Ctrl+C | есть выделение → копировать и снять выделение; нет → `^C` (прерывание) | BUG (всегда `^C`) | OK | pw:ctrl-c |
| UI-26 | Ctrl+Shift+C / Ctrl+Shift+V | всегда копировать / вставить | OK | OK | pw:clipboard |
| UI-27 | Ctrl+Insert / Shift+Insert | копировать / вставить | NO | OK | pw:clipboard |
| UI-28 | Ctrl+V | вставить (как в Windows Terminal); настройка `terminal.ctrl_v_paste` | NO | OK | pw:clipboard |
| UI-29 | Правая кнопка мыши | настройка: меню (по умолчанию) / вставить / копировать-если-выделено-иначе-вставить | BUG (только меню) | OK | pw:rclick |

## 3. Выделение и буфер (T-11)
| ID | Действие | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-30 | Двойной клик | выделить слово | OK | OK | ручн. |
| UI-31 | Тройной клик | выделить строку | OK | OK | ручн. |
| UI-32 | Alt+перетаскивание | прямоугольное выделение | OK | OK | ручн. |
| UI-33 | Shift+клик | расширить выделение | OK | OK | ручн. |
| UI-34 | Копировать при выделении (настройка) | выделение сразу в буфер | NO | OK | pw:copy-on-select |
| UI-35 | Многострочная вставка | предупреждение «вставить N строк?» (настройка), Enter/Esc | NO | OK | pw:paste-warn |
| UI-36 | Bracketed paste | `ESC[200~…ESC[201~` **только** если программа включила режим 2004 | BUG (всегда, если есть `\n`) | OK (`term.paste`) | pw:bracketed |
| UI-37 | OSC 52 | программа может записать в буфер | OK (ClipboardAddon) | OK | pw:osc52 |

## 4. Прокрутка (T-12)
| ID | Действие | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-40 | История | 10 000–100 000 строк, настройка `terminal.scrollback` | BUG (жёстко 20 000) | OK | pw:scrollback |
| UI-41 | Колесо, Shift+PgUp/PgDn | прокрутка | OK | OK | ручн. |
| UI-42 | Ctrl+Shift+Home / Ctrl+Shift+End | к началу / к концу | NO | OK | pw:keys |
| UI-43 | Ctrl+Shift+↑/↓ | к предыдущему/следующему блоку команды | OK | OK | pw:blocks |

## 5. Режимы терминала (T-13)
| ID | Режим | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-50 | Альтернативный экран (vim, less, fzf, mc, btop4win, `wsl tmux`) | полноэкранные программы, возврат истории | OK | OK | ручн., pw:altscreen |
| UI-51 | Мышь в TUI, Shift — обход | события мыши в программу; с Shift — выделение | OK | OK | ручн. |
| UI-52 | Truecolor / 256 цветов | 24-битные цвета | OK | OK | pw:colors |
| UI-53 | DECSCUSR | форма/мигание курсора от программы | OK | OK | pw:cursor |
| UI-54 | Reflow при ресайзе | перенос строк пересчитывается | OK | OK | ручн. |
| UI-55 | Широкие символы / эмодзи | unicode11 | OK | OK | ручн. |
| UI-56 | Ссылки OSC 8 и автоссылки, пути `C:\…`, `D:/…`, `.\x`, `src\a.py:42` | клик — превью, 2× — открыть, Ctrl — показать в Проводнике | BUG (только POSIX-пути) | OK | pw:links |
| UI-57 | Заголовок OSC 0/2 | заголовок вкладки и окна | BUG (только вкладка) | OK | pw:osc-title |
| UI-58 | OSC 4/10/11/12 | смена палитры/цветов программой | OK (xterm.js) | OK | ручн. |
| UI-59 | Звонок BEL | настройка: звук / мигание / выкл; неактивная вкладка — точка | BUG (только точка) | OK | pw:bell |

## 6. Вкладки и панели (T-14)
| ID | Действие | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-60 | «+» / Ctrl+Shift+T | новая вкладка (профиль по умолчанию, cwd текущей) | OK | OK | pw:tabs |
| UI-61 | «+» правой кнопкой / стрелка | выбор профиля (PowerShell 7, Windows PowerShell, cmd, WSL-дистрибутивы, Git Bash) | NO | OK | pw:profiles |
| UI-62 | Крестик / Ctrl+Shift+W / средняя кнопка | закрыть; если идёт процесс — подтверждение | BUG (без подтверждения) | OK | pw:tabs |
| UI-63 | Двойной клик по вкладке / F2 в палитре | переименовать | NO | OK | pw:tabs |
| UI-64 | Перетаскивание вкладки | смена порядка | NO | OK | pw:tabs |
| UI-65 | Ctrl+Shift+D | дублировать вкладку (тот же профиль и папка) | NO | OK | pw:tabs |
| UI-66 | Ctrl+Tab / Ctrl+Shift+Tab | следующая / предыдущая вкладка | BUG (только вперёд) | OK | pw:tabs |
| UI-67 | Alt+1…9 | перейти на вкладку N (9 — последняя) | BUG (было Ctrl+Alt+N — конфликт с AltGr) | OK | pw:tabs |
| UI-68 | Alt+Shift+Plus / Alt+Shift+Minus | разделить панель вертикально / горизонтально | NO | OK | pw:split |
| UI-69 | Alt+стрелки | фокус соседней панели; Ctrl+Shift+W закрывает панель | NO | OK | pw:split |
| UI-70 | Восстановление при запуске | вкладки, профили и папки последнего сеанса (настройка) | NO | OK | pw:restore |
| UI-71 | Точка активности | вывод/звонок в неактивной вкладке | OK | OK | pw:tabs |
| UI-72 | Завершение процесса | «процесс завершён (код N) — Enter: перезапуск» | OK | OK | pw:exit |

## 7. Поиск, масштаб, вид (T-15)
| ID | Действие | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-80 | Ctrl+Shift+F | панель поиска; Enter/Shift+Enter, Esc | OK | OK | pw:search |
| UI-81 | Регистр / слово / регулярка | переключатели `Aa`, `W`, `.*` | NO | OK | pw:search |
| UI-82 | Подсветка всех совпадений, счётчик | `n / N` | NO | OK | pw:search |
| UI-83 | Ctrl+= / Ctrl+− / Ctrl+0 | крупнее / мельче / сброс шрифта | BUG (нет Ctrl+0) | OK | pw:zoom |
| UI-84 | Ctrl+колесо | масштаб шрифта | NO | OK | pw:zoom |
| UI-85 | Ctrl+Shift+K | очистить экран и историю | OK | OK | pw:keys |
| UI-86 | Ctrl+Shift+H / Ctrl+Shift+B | скрыть правую / левую колонку | BUG (левая — Ctrl+Alt+B, конфликт с AltGr) | OK | pw:keys |

## 8. Блоки команд (OSC 133)
| ID | Действие | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-90 | Рамка блока, `✓ время` / `EXIT N · время` | по OSC 133 C/D | OK (zsh/bash) | OK (+PowerShell) | pw:blocks, py:pwsh-osc |
| UI-91 | Меню блока: копировать команду / вывод, выполнить снова, Haotica: разобрать | правая кнопка по блоку | OK | OK | pw:blockmenu |
| UI-92 | Уведомление о долгой команде (>10 с, окно не в фокусе) | системное уведомление (трей на Windows) | BUG (`notify-send`) | OK | ручн. |
| UI-93 | Ошибка команды → журнал + анализ Haotica | `EXIT N` в LOG, `/api/terminal/block` | OK | OK | pw:blocks |

## 9. Правая колонка и Haotica
| ID | Элемент | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-100 | Вкладки LOG / FILES / PREVIEW / HAOTICA | переключение, счётчик непрочитанного LOG | OK | OK | pw:panels |
| UI-101 | FILES: список, категории, скрытые, 2× — открыть, меню, перетаскивание в терминал | работает на путях Windows (`C:\`, кириллица, пробелы) | BUG (POSIX-кавычки и пути) | OK | pw:files, py:fs |
| UI-102 | PREVIEW: изображение, PDF, видео, аудио, markdown, код, архив, hex | без зависаний (W6 расширяет) | OK | OK | pw:preview |
| UI-103 | Блок DL (загрузки и модели) | прогресс моделей; клик — Настройки → Haotica → Модели | BUG (открывал Linux-приложение `updates`) | OK | pw:dl |
| UI-104 | Мини-чат под аватаром (было `#h-reply` + `#h-input`) | лента, история, шаги, стоп (W2) | BUG (одна реплика) | см. W2 | pw:chat |
| UI-105 | Карточка команды [TAB]/[ESC]; опасная — только кнопкой | всегда включена | OK | OK | pw:card |
| UI-106 | Полосы VITALS (CPU/GPU/RAM/GTT/TEMP/FAN/BAT/AI) | клик — монитор; на Windows без TEMP/FAN, если нет данных | BUG (Linux-приложения) | OK | pw:vitals |
| UI-107 | Глобус (Network Recon), режим питания | Linux-функции: на Windows скрыты | BUG | OK (скрыты флагом платформы) | pw:platform |
| UI-108 | Аватар: клик — панель HAOTICA | | OK | OK | pw:panels |

## 10. Интеграция с Windows (T-17)
| ID | Функция | Ожидаемое | До | После | Тест |
|---|---|---|---|---|---|
| UI-110 | Перетаскивание файла из Проводника | путь в кавычках по правилам оболочки (PowerShell `'…'`, cmd `"…"`, bash `'…'`) | BUG (POSIX) | OK | pw:drop |
| UI-111 | «Открыть в HAOTICA Terminal» в меню Проводника | `HKCU\Software\Classes\Directory\{shell,Background\shell}\HaoticaTerminal` | NO | OK (установщик) | ручн. |
| UI-112 | `haotica .` / `haotica-terminal <папка>` | новая вкладка в этой папке (в уже открытом окне) | NO | OK | py:cli |
| UI-113 | Запуск от имени администратора | пункт палитры: новое окно через `ShellExecute runas` | NO | OK | ручн. |
| UI-114 | Профили: PowerShell 7, Windows PowerShell 5.1, cmd, WSL (по `wsl -l -q`), Git Bash | список в «+» и в настройках | NO | OK | py:profiles |

## 11. Настройки терминала (T-16, `apps/settings` → «Терминал»)
| ID | Настройка | Ключ `settings.toml` | До | После |
|---|---|---|---|---|
| UI-120 | Профиль по умолчанию, профили (оболочка, папка, переменные) | `terminal.default_profile`, `terminal.profiles` | NO | OK |
| UI-121 | Шрифт, размер, межстрочный интервал | `terminal.font`, `terminal.font_size`, `terminal.line_height` | NO | OK |
| UI-121a | Лигатуры | `terminal.ligatures` | NO | NO (аддон лигатур xterm не подключён — следующий шаг) |
| UI-122 | История строк | `terminal.scrollback` | NO | OK |
| UI-123 | Курсор (форма, мигание) | `terminal.cursor_style`, `terminal.cursor_blink` | NO | OK |
| UI-124 | Звонок | `terminal.bell` = `sound`/`visual`/`off` | NO | OK |
| UI-125 | Копировать при выделении, правая кнопка, Ctrl+V, предупреждение о вставке | `terminal.copy_on_select`, `terminal.right_click`, `terminal.ctrl_v_paste`, `terminal.paste_warn` | NO | OK |
| UI-126 | Восстанавливать вкладки | `terminal.restore_tabs` | NO | OK |
| UI-127 | CRT и фон | `effects.crt_terminal`, `effects.terminal_art` | OK | OK |
| UI-128 | Горячие клавиши: просмотр и переопределение | `terminal.keys` (`"ctrl+shift+t" = "newTab"`) | NO | OK |
| UI-129 | Где Haotica выполняет команды: своя вкладка / текущая | `terminal.haotica_tab` = `separate`/`active` | NO | OK |

## 12. Первый запуск и диагностика (T-71, T-72)
| ID | Элемент | Ожидаемое | После | Тест |
|---|---|---|---|---|
| UI-130 | Мастер первого запуска | система → модели (размер, загрузка) → оболочка → голос → ключ; «позже» | OK | pw:wizard |
| UI-131 | Палитра → «Мастер первого запуска», «Диагностика» | открыть мастер повторно | OK | pw:palette |
| UI-132 | `haotica doctor` | проверки Windows, коды OK/WARN/FAIL | OK | CI: смоук exe |
