# LyricsEngine 1.1

Всплывающий текст песни под 30-секундное превью. Слова строки появляются по одному в
разных местах, а в паузах идёт волна. По умолчанию **без фона**: только строки и частицы
поверх сайта, а клики проходят к странице. Чистый JS без зависимостей и сборки, работает
со статического хостинга.

## Как пользоваться с ИИ

1. Отправьте в чат с ИИ этот архив и файлы своего сайта.
2. Вставьте текст из `PROMPT.txt` и при необходимости поправьте его.
3. ИИ прочитает `AI_GUIDE.md`, найдёт плеер, подключит движок и подберёт цвета и шрифт под сайт.

## Состав

```
lyrics-engine.js     движок (UMD: window.LyricsEngine, CommonJS, AMD)
lyrics-engine.mjs    вход для import
AI_GUIDE.md          пошаговая инструкция для ИИ: рецепты подключения, тема под сайт, чек-лист
PROMPT.txt           готовый промт для чата
demo.html            пример «сайта» с плеером: текст рядом с плеером и поверх страницы, 4 темы
tools/compute_offsets.py   офлайн-подбор сдвигов превью через Whisper → offsets.json
test/                автотесты (node, Chromium, python)
```

## Подключение вручную

```html
<script src="lyrics-engine.js"></script>
<script>
  LyricsEngine.create({ audio: document.querySelector('audio'),
    container: '#lyrics',                       // без container — поверх всего сайта
    track: { artist: 'Artist', title: 'Song' } }).open();
</script>
```

Совсем без кода:

```html
<div data-le-audio="#player" data-le-artist="Artist" data-le-title="Song" style="height:360px"></div>
<script src="lyrics-engine.js" data-auto></script>
```

## Опции

| Опция | По умолчанию | Что делает |
|---|---|---|
| `audio` | обязательно | `<audio>` или селектор. Движок не создаёт звук и не управляет им |
| `container` | весь экран | Блок, в котором рисуется текст (нужна высота, от 240 px) |
| `track` | обязательно | `{ artist, title, album?, duration?, offset? }`; `duration` — длина полного трека |
| `offset` / `offsetProvider` | — | С какой секунды песни начинается превью; `LyricsEngine.offsetsFromJson('offsets.json')` |
| `theme` | `'clean'` | `'clean'` (без фона, с частицами), `'minimal'` (без частиц, цветом и шрифтом сайта), `'dark-grain'` (тёмный экран как в видео) или объект, см. ниже |
| `calibration` | `'auto'` | Панель «−0.5 / +0.5 с / Я слышу эту строку». `'auto'` — открыта, пока сдвиг неизвестен, потом прячется за кнопку; `true` — всегда; `false` — нет |
| `closeButton` | `true` | Крестик |
| `modal` | `false` для прозрачных тем | Оверлей как диалог: перехват фокуса, клики не проходят |
| `analyser` | авто | Готовый `AnalyserNode` сайта; `false` — всегда анимированная волна |
| `sources` | `[lrclib]` | Источники текста |
| `lang`, `labels` | по `<html lang>` | Язык кнопок (ru/en) или свои подписи |
| `onState`, `on` | — | Колбэк состояния; `{ событие: fn }` |
| `autoload` | `true` | `false` — грузить текст при первом `open()` |

Тема-объект: `{ extends, text, shadow, wave, particle, particles, size, font, weight, ui, uiBackground, background, grain, vignette }`.
`font: 'inherit'` — шрифт сайта; `'currentColor'` в цветах — цвет текста сайта; `size` — множитель размера слов.
Тонкая доводка — CSS сайта для классов `.le-word`, `.le-root button`, `.le-hint` и других `.le-*`.

Методы: `open()`, `close()`, `destroy()`, `setTrack(track)`, `setOffset(sec)`, `getOffset()`, `calibrate(i, t?)`,
`resetOffset()`, `on(event, fn)`, `off(event, fn)`; свойства `state`, `track`, `lines`, `offsetSource`, `isOpen`.
Состояния: `idle` → `loading` → `ready` | `no-sync` | `error`.
События: `ready`, `line`, `word`, `gap`, `offsetchange`, `error`, `state`.

Помощники: `LyricsEngine.itunesPreview(artist, title)` — поиск превью с нечётким сравнением названия;
`LyricsEngine.offsetsFromJson(url)`; `LyricsEngine.auto()`; `LyricsEngine.isRouted(audio)`.

## Сдвиг превью

`songTime = audio.currentTime + offset`. Приоритет: `setOffset()` → калибровка пользователя
(хранится в `localStorage`, работает и без него) → `track.offset` / `offset` → `offsetProvider` → 0.
Если превью начинается посреди строки, она пропускается до первой целой. Вне превью сцена пустая.

Сдвиги для всех треков сайта можно посчитать заранее:

```bash
pip install faster-whisper     # или openai-whisper; нужен ffmpeg
python tools/compute_offsets.py tracks.json -o offsets.json
```
Ненадёжные результаты не записываются: мало совпадений, разброс или повторяющийся припев.

## CORS и звук

Волна по реальному звуку работает, только если у `<audio>` задан `crossOrigin` и сервер превью
отдаёт CORS-заголовки. Иначе движок не трогает звук и рисует анимированную волну.
Элемент подключается к Web Audio один раз и навсегда; движок делит это подключение между
экземплярами и не ломается, если сайт уже подключил элемент сам.

## Права на тексты

Тексты песен принадлежат правообладателям. Движок их не содержит и не сохраняет: он получает
их у LRCLIB во время показа. LRCLIB лицензий не даёт. Перед публичным запуском проверьте,
что показ текстов законен, или подключите лицензированный источник через `sources`.

## Тесты

```bash
node --test test/unit.test.js
npm i -D playwright-core && node test/browser.test.cjs [--shots out/]
python -m unittest tools/test_compute_offsets.py
```
Сеть в тестах подменена: тексты в фикстурах выдуманы, звук генерируется.
