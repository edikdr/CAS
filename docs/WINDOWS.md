# HAOTICA Terminal для Windows

Терминал в стиле HAOTICA (CRT, аватар, блоки команд) с локальным ИИ **Haotica**: PowerShell 7, Windows PowerShell,
cmd, WSL и Git Bash во вкладках и панелях; Haotica сама выполняет цепочки команд в видимой вкладке «HAOTICA»
с карточками подтверждения. Три локальные модели для кода (fast / base / deep) и одна модель речи.

## Установка (без прав администратора)

1. Скачайте `HaoticaTerminal-Setup.exe` (GitHub → Actions → «HAOTICA Terminal (Windows)» → артефакт
   **HaoticaTerminal-Setup** последнего зелёного прогона ветки `terminal-windows`) и запустите.
   Галочки: «Открыть в HAOTICA Terminal» в Проводнике, `haotica` в PATH, автозапуск — по желанию.
2. При первом запуске откроется мастер: проверка системы → модели (минимум FAST + BASE, ~20 ГБ; DEEP ~45 ГБ
   по желанию) → оболочка по умолчанию → голос → ключ облачной модели (необязательно).
3. Модели и llama.cpp качаются в фоне с докачкой и проверкой SHA-256 (прогресс — блок DL справа сверху).
   Терминал работает сразу, Haotica включается, когда скачается BASE.

Без установщика (разработка), из корня репозитория:
```powershell
py -3.12 -m venv .venv; .venv\Scripts\pip install -r packaging\windows\requirements.txt
$env:HAOTICA_DEV_ROOT = (Get-Location).Path; $env:PYTHONPATH = "$PWD\core"
.venv\Scripts\python -m haotica.apps terminal      # ядро и агент поднимутся сами
```
Сборка установщика: `powershell -ExecutionPolicy Bypass -File packaging\windows\build.ps1` (нужен Inno Setup 6).

## Команды

| Команда | Что делает |
|---|---|
| `haotica .` / `haotica <папка>` | вкладка терминала в этой папке (в уже открытом окне) |
| `haotica doctor` | диагностика: ConPTY, оболочки, порты служб, llama-server и видеокарта, модели, речь, диск |
| `haotica models status\|download [fast base deep]\|verify` | модели |
| `haotica llama install vulkan\|status\|bench` | llama.cpp (тег b12032, SHA-256); `bench` выбирает быстрый бэкенд |
| `haotica voice install <движок>` | служба речи (нужен `uv`: `winget install astral-sh.uv`) |
| `haotica key set openrouter` | ключ в Диспетчер учётных данных Windows (ввод скрыт) |
| `hy вопрос` (в PowerShell) | спросить Haotica из строки |

## Клавиши (как в Windows Terminal)

Ctrl+C — копировать, если есть выделение, иначе прерывание · Ctrl+V, Shift+Insert — вставить · Ctrl+Insert — копировать ·
Ctrl+Shift+T — вкладка · Ctrl+Shift+W — закрыть панель/вкладку · Ctrl+Shift+D — дублировать · Ctrl+Tab / Ctrl+Shift+Tab ·
Alt+1…9 · Alt+Shift+Plus / Alt+Shift+Minus — разделить · Alt+стрелки — соседняя панель · Ctrl+Shift+F — поиск ·
Ctrl+Shift+P — команды · Ctrl+= / Ctrl+− / Ctrl+0, Ctrl+колесо — шрифт · F11 — во весь экран ·
Ctrl+Shift+B / Ctrl+Shift+H — левая/правая колонка. Полный список и статусы — `docs/UI-INVENTORY.md`.

## Где что лежит

Настройки `%APPDATA%\Haotica\settings.toml` · данные и модели `%LOCALAPPDATA%\Haotica\data` · токен, состояние
`%LOCALAPPDATA%\Haotica\state` · журналы `%LOCALAPPDATA%\Haotica\logs` (core, agent, llm-*, tts, agent-steps.jsonl) ·
llama.cpp и окружение речи `%LOCALAPPDATA%\Haotica\opt`. Все службы слушают только 127.0.0.1 и закрываются вместе
с окном (Job Object).

## Голос

Везде — голос Сары: локальный клон по образцу. По-русски — по её русским репликам (`assets/sounds/voice/ref_sarah_ru.ogg`,
без английского акцента), по-английски и по-немецки — `ref_sarah_1.mp3`. Тон — «Настройки → Голос → Тон голоса»
(`haotica.voice_pitch`, полутоны; по умолчанию +1, чуть выше образца), применяется после «Перезапустить голос».
Свой образец: `%LOCALAPPDATA%\Haotica\data\voice\sarah_ru.wav` (или `sarah.wav`). По умолчанию Chatterbox
Multilingual (`haotica voice install chatterbox`), дальше по порядку Qwen3-TTS, F5, XTTS; запасной — ElevenLabs Sarah
(ключ в Настройках). Чужими голосами (Piper, Silero) Haotica не говорит, если их не выбрать явно.
Подача — `core/haotica/tts/prosody.py`: паузы между фразами и после «…», интонация вопроса/восклицания/предупреждения,
темп по смыслу, *смеётся*/*вздыхает*/*хмыкает* — записанные эмоции Сары; код и ссылки вслух не читаются.
Сравнение движков — `samples/tts/eval.json` и страница `samples/tts/index.html` (слепое прослушивание + демо).

## Безопасность (не отключается)

Опасные команды (Remove-Item -Recurse, Format-Volume, reg delete, iex (iwr …), del /s, diskpart, shutdown…) —
только по отдельной карточке, «весь план» их не разрешает. Закрытые зоны (ключи, Credential Manager, профили
браузеров, банковский профиль, токен HAOTICA) — отказ без карточки. Секреты вычищаются из всего, что уходит
в модели; ключи — только в Credential Manager.
