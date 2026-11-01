pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import "../theme"
import "../services"

// ГЛИТЧ для окон: при открытии и закрытии поверх окна пробегают сдвинутые полосы сигнала.
// Само окно Hyprland раскрывает/схлопывает как кинескоп (стиль gnomed), скорость 0.7×.
Scope {
    id: root
    property var geo: ({})        // адрес окна → прямоугольник (для закрытия)
    property var rect: null
    property bool closing: false

    function findToplevel(addr) {
        const tl = Hyprland.toplevels.values;
        for (let i = 0; i < tl.length; i++) if ((tl[i].address || "").replace("0x", "") === addr.replace("0x", "")) return tl[i];
        return null;
    }
    function rectOf(t) {
        const o = t ? t.lastIpcObject : null;
        if (!o || !o.at || !o.size) return null;
        return { x: o.at[0], y: o.at[1], w: o.size[0], h: o.size[1] };
    }
    function show(r, isClose) {
        if (!r || Theme.reduceMotion || Theme.glitch <= 0) return;
        const mon = Hyprland.focusedMonitor;
        root.rect = { x: r.x - (mon ? mon.x : 0), y: r.y - (mon ? mon.y : 0), w: r.w, h: r.h };
        root.closing = isClose;
        Sound.play(isClose ? "win_close" : "win_open");
        bands.restart();
    }

    Connections {
        target: Hyprland
        function onRawEvent(event) {
            if (event.name === "openwindow") {
                const addr = event.data.split(",")[0];
                opener.addr = addr;
                opener.restart();
            } else if (event.name === "closewindow") {
                const r = root.geo[event.data];
                if (r) root.show(r, true);
                delete root.geo[event.data];
            } else if (event.name === "movewindow" || event.name === "changefloatingmode" || event.name === "activewindowv2") {
                cache.restart();
            }
        }
    }
    // окно получает размер не сразу — ждём кадр и обновляем данные
    Timer {
        id: opener
        property string addr: ""
        interval: 40
        onTriggered: { Hyprland.refreshToplevels(); waitGeo.restart(); }
    }
    Timer {
        id: waitGeo
        interval: 30
        onTriggered: {
            const t = root.findToplevel(opener.addr);
            const r = root.rectOf(t);
            if (r) { root.geo[opener.addr] = r; root.show(r, false); }
        }
    }
    Timer {
        id: cache
        interval: 250
        onTriggered: {
            Hyprland.refreshToplevels();
            const tl = Hyprland.toplevels.values;
            for (let i = 0; i < tl.length; i++) {
                const r = root.rectOf(tl[i]);
                if (r) root.geo[(tl[i].address || "").replace("0x", "")] = r;
            }
        }
    }

    PanelWindow {
        id: overlay
        visible: bands.running
        screen: {
            const m = Hyprland.focusedMonitor;
            const s = Quickshell.screens;
            for (let i = 0; i < s.length; i++) if (m && s[i].name === m.name) return s[i];
            return s.length > 0 ? s[0] : null;
        }
        anchors { top: true; bottom: true; left: true; right: true }
        exclusionMode: ExclusionMode.Ignore
        color: "transparent"
        mask: Region {}
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.namespace: "hyperina-glitch"

        Item {
            id: area
            x: root.rect ? root.rect.x : 0
            y: root.rect ? root.rect.y : 0
            width: root.rect ? root.rect.w : 0
            height: root.rect ? root.rect.h : 0
            clip: true
            Repeater {
                id: strips
                model: 7
                Item {
                    id: strip
                    required property int index
                    y: area.height * index / 7
                    width: area.width
                    height: area.height / 7
                    property real shift: 0
                    Rectangle { x: strip.shift; width: parent.width; height: 1; y: parent.height * 0.3; color: Theme.coral; opacity: 0.55 }
                    Rectangle { x: -strip.shift * 0.7; width: parent.width; height: 1; y: parent.height * 0.62; color: Theme.sky; opacity: 0.5 }
                    Rectangle { x: strip.shift * 0.4; width: parent.width * (0.2 + (strip.index % 3) * 0.2); height: parent.height * 0.35; y: parent.height * 0.2; color: Theme.ink; opacity: 0.06 }
                }
            }
        }
    }

    // кадры сбоя: 6 ступеней с резкими сдвигами, длительность /0.7
    SequentialAnimation {
        id: bands
        property int step: Math.round((root.closing ? 200 : 280) / 6 / Math.max(0.1, Theme.windowSpeed))
        loops: 1
        ScriptAction { script: root.jitter(28) }
        PauseAnimation { duration: bands.step }
        ScriptAction { script: root.jitter(20) }
        PauseAnimation { duration: bands.step }
        ScriptAction { script: root.jitter(26) }
        PauseAnimation { duration: bands.step }
        ScriptAction { script: root.jitter(12) }
        PauseAnimation { duration: bands.step }
        ScriptAction { script: root.jitter(6) }
        PauseAnimation { duration: bands.step * 2 }
    }
    function jitter(amp) {
        for (let i = 0; i < strips.count; i++) {
            const s = strips.itemAt(i);
            if (s) s.shift = (Math.random() - 0.5) * 2 * amp * Theme.glitch;
        }
    }
}
