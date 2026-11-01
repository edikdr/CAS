pragma Singleton
import QtQuick
import Quickshell
import "../theme"

// Звуки интерфейса. Приглушённые, уважают «тихие часы» и отключение отдельных событий.
Singleton {
    id: root
    readonly property var cfg: Theme.s.sound || ({})
    readonly property real volume: cfg.volume !== undefined ? cfg.volume : 0.55
    readonly property string dir: Theme.shareDir + "/sounds/ui/"

    function quietNow() {
        if (cfg.quiet_hours !== true) return false;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const p = s => { const a = (s || "00:00").split(":"); return parseInt(a[0]) * 60 + parseInt(a[1]); };
        const a = p(cfg.quiet_start), b = p(cfg.quiet_end);
        return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
    }

    function play(name) {
        if (cfg.ui_sounds === false || Theme.gameMode) return;
        const ev = cfg.events || {};
        if (ev[name] === false) return;
        const v = quietNow() ? volume * 0.35 : volume;
        Quickshell.execDetached(["pw-play", "--volume", v.toFixed(2), root.dir + name + ".ogg"]);
    }
}
