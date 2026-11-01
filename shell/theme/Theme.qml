pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// HYPERINA: тема оболочки. Источник — $XDG_RUNTIME_DIR/hyperina/theme.json (пишет ядро),
// при отсутствии — ~/.config/hyperina/theme.json, затем встроенные значения MIX.
Singleton {
    id: root

    readonly property string runtimeDir: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/hyperina"
    readonly property string homeDir: Quickshell.env("HOME") || ""
    readonly property string dataDir: homeDir + "/.local/share/hyperina"
    readonly property string shareDir: "/usr/share/hyperina"

    property var t: ({})
    property var s: ({})

    function c(name, fallback) {
        const cols = (t.colors || {});
        return cols[name] !== undefined ? cols[name] : fallback;
    }

    // цвета (палитра MIX по умолчанию)
    readonly property color bg0: c("bg0", "#000000")
    readonly property color bg1: c("bg1", "#0D0D0B")
    readonly property color bg2: c("bg2", "#181714")
    readonly property color line: c("line", "#3B382F")
    readonly property color lineHi: c("line_hi", "#857F6E")
    readonly property color ink: c("ink", "#E8DFC9")
    readonly property color dim: c("dim", "#A39B87")
    readonly property color inkFaint: c("ink_faint", "#1E1D1A")
    readonly property color hover: c("hover", "#23221E")
    readonly property color accent: c("accent", "#E0A243")
    readonly property color accent2: c("accent2", "#5FA8A0")
    readonly property color accentDim: c("accent_dim", "#57401D")
    readonly property color selection: c("selection", "#4A3920")
    readonly property color teal: c("teal", "#5FA8A0")
    readonly property color amber: c("amber", "#E0A243")
    readonly property color coral: c("coral", "#E0705A")
    readonly property color green: c("green", "#8FBF7A")
    readonly property color violet: c("violet", "#A7A3F0")
    readonly property color sky: c("sky", "#4FA6DC")

    function category(cat) {
        const m = (t.categories || {});
        return m[cat] !== undefined ? m[cat] : sky;
    }
    function alpha(col, a) { return Qt.rgba(col.r, col.g, col.b, a); }

    // шрифты
    readonly property var fonts: t.fonts || ({})
    readonly property string fontUi: fonts.ui || "IBM Plex Sans"
    readonly property string fontMono: fonts.mono || "IBM Plex Mono"
    readonly property string fontDisplay: fonts.display || "Unbounded"
    readonly property string fontDot: fonts.dot || "Doto"
    readonly property string fontPixel: fonts.pixel || "Departure Mono"
    readonly property real fontSize: fonts.size || 10.5

    // геометрия
    readonly property var geometry: t.geometry || ({})
    readonly property int chamfer: geometry.chamfer !== undefined ? geometry.chamfer : 8
    readonly property int radius: geometry.radius !== undefined ? geometry.radius : 4
    readonly property int gap: geometry.gap !== undefined ? geometry.gap : 8

    // эффекты и анимации
    readonly property var effects: t.effects || ({})
    readonly property real glow: effects.glow !== undefined ? effects.glow : 0.25
    readonly property real scanlines: effects.scanlines !== undefined ? effects.scanlines : 0.02
    readonly property real grain: effects.grain !== undefined ? effects.grain : 0.03
    readonly property real glitch: effects.glitch !== undefined ? effects.glitch : 1.0
    readonly property var anim: t.animations || ({})
    readonly property bool reduceMotion: anim.reduce_motion === true || gameMode
    readonly property real speed: anim.speed || 1.0
    readonly property real scanSpeed: anim.scan || 0.5
    readonly property real decodeSpeed: anim.decode || 0.5
    readonly property real windowSpeed: anim.window || 0.7
    readonly property string preset: anim.preset || "SIGNAL"
    readonly property real liveliness: t.liveliness !== undefined ? t.liveliness : 0.65
    readonly property var wallpaper: t.wallpaper || ({ name: "statue", live: true })

    // длительность с учётом общей скорости: ms(200) → 200 мс при 1×
    function ms(base) { return reduceMotion ? 0 : Math.round(base / Math.max(0.1, speed)); }

    // состояние сессии, которое влияет на «живость»
    property bool gameMode: false
    property bool onBattery: false

    // ── чтение файлов ─────────────────────────────────────────────
    FileView {
        id: themeFile
        path: root.runtimeDir + "/theme.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: root.parseTheme(text())
        onLoadFailed: fallbackTheme.reload()
    }
    FileView {
        id: fallbackTheme
        path: root.homeDir + "/.config/hyperina/theme.json"
        onLoaded: if (Object.keys(root.t).length === 0) root.parseTheme(text())
    }
    FileView {
        id: settingsFile
        path: root.runtimeDir + "/settings.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: {
            try { root.s = JSON.parse(text()); } catch (e) { console.warn("settings.json:", e); }
        }
    }

    function parseTheme(txt) {
        try { root.t = JSON.parse(txt); } catch (e) { console.warn("theme.json:", e); }
    }

    function reload() { themeFile.reload(); settingsFile.reload(); }
}
