pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import "../theme"
import "../services"
import "../components"

// HUD рабочего стола: часы, досье системы, глобус сети, журнал. Прячется, когда открыты окна.
PanelWindow {
    id: hud
    required property var modelData
    screen: modelData
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Normal
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Bottom
    WlrLayershell.namespace: "hyperina-hud"
    mask: Region {
        Region { item: hud.busy ? null : clockBox }
        Region { item: hud.busy ? null : dossier }
        Region { item: hud.busy ? null : globeBox }
    }

    readonly property var monitor: Hyprland.monitorFor(hud.screen)
    readonly property bool busy: monitor && monitor.activeWorkspace ? monitor.activeWorkspace.toplevels.values.length > 0 : false
    readonly property var widgets: (Theme.s.desktop && Theme.s.desktop.widgets) ? Theme.s.desktop.widgets : ["dossier", "clock", "globe", "bust"]
    function on(w) { return widgets.indexOf(w) >= 0; }

    SystemClock { id: clock; precision: SystemClock.Seconds }

    Item {
        id: content
        anchors.fill: parent
        opacity: hud.busy ? 0 : 1
        visible: opacity > 0.01
        Behavior on opacity { NumberAnimation { duration: Theme.ms(320); easing.type: Easing.InOutQuad } }

        // ── часы ─────────────────────────────────────────────────────
        Item {
            id: clockBox
            visible: hud.on("clock")
            anchors { top: parent.top; right: parent.right; topMargin: 36; rightMargin: 48 }
            width: 400; height: 150
            Text {
                id: bigTime
                anchors.right: parent.right
                text: Qt.formatDateTime(clock.date, "HH:mm")
                color: Theme.ink
                font.family: Theme.fontDot
                font.pixelSize: 104
                font.weight: Font.Black
            }
            Row {
                anchors { right: parent.right; top: bigTime.bottom; topMargin: -6 }
                spacing: 10
                Plate { text: Qt.formatDateTime(clock.date, "dddd").toUpperCase(); pixelSize: 10 }
                Text {
                    text: Qt.formatDateTime(clock.date, "dd.MM.yyyy") + "  ·  " + Qt.formatDateTime(clock.date, "ss") + "s"
                    color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 12; font.letterSpacing: 1
                    anchors.verticalCenter: parent.verticalCenter
                }
            }
        }

        // ── досье системы ────────────────────────────────────────────
        PanelCard {
            id: dossier
            visible: hud.on("dossier")
            anchors { top: clockBox.bottom; right: parent.right; topMargin: 18; rightMargin: 48 }
            width: 360
            title: "SYSTEM // DOSSIER"
            tag: State.gameMode ? "GAME" : (State.powerProfile || "").toUpperCase()
            tagColor: State.gameMode ? Theme.coral : Theme.dim
            Column {
                width: parent.width
                spacing: 7
                Sparkline { width: parent.width; height: 44; values: State.cpuHistory; color: Theme.teal }
                DossierRow { width: parent.width; key: "CPU"; value: Math.round(State.cpu) + "%" }
                DossierRow { width: parent.width; key: "GPU · 8060S"; value: Math.round(State.gpu) + "%" }
                DossierRow { width: parent.width; key: "GTT"; value: State.gttUsed.toFixed(1) + " / " + State.gttTotal.toFixed(0) + " GB" }
                SegBar { width: parent.width; value: State.gttTotal > 0 ? State.gttUsed / State.gttTotal : 0; count: 24; fillColor: Theme.violet }
                DossierRow { width: parent.width; key: "THERMAL"; value: Math.round(State.tempCpu) + "°C"; valueColor: State.tempCpu > 85 ? Theme.coral : (State.tempCpu > 72 ? Theme.amber : Theme.ink) }
                DossierRow { width: parent.width; key: "FAN"; value: State.fan > 0 ? State.fan + " RPM" : "—" }
                DossierRow { width: parent.width; key: "NEURAL CORE"; value: State.llmState === "ready" ? State.tokensPerSec.toFixed(0) + " TOK/S" : State.llmState.toUpperCase(); valueColor: State.llmState === "ready" ? Theme.violet : Theme.dim }
                Row {
                    spacing: 10
                    Text { id: hint; text: "▲▼ : ВЫБОР   ⏎ : ДАШБОРД"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 9; font.letterSpacing: 1 }
                    Hatch { width: 70; height: 7; anchors.verticalCenter: hint.verticalCenter }
                }
            }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Ui.dashboardOpen = true }
        }

        // ── глобус сети: точки, вращение, кольца пинга ───────────────
        Item {
            id: globeBox
            visible: hud.on("globe")
            width: 360; height: 300
            anchors { right: parent.right; bottom: parent.bottom; bottomMargin: 84 }
            clip: true
            property real rot: 0
            property var rings: []
            Canvas {
                id: globe
                width: 520; height: 520
                x: 90; y: 40
                onPaint: {
                    const ctx = getContext("2d");
                    ctx.reset();
                    const R = 230, cx = width / 2, cy = height / 2, tilt = 0.38;
                    const st = Math.sin(tilt), ct = Math.cos(tilt);
                    function proj(lat, lon) {
                        const la = lat * Math.PI / 180, lo = lon * Math.PI / 180 + globeBox.rot;
                        let x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
                        const y2 = y * ct - z * st, z2 = y * st + z * ct;
                        return [cx + x * R, cy - y2 * R, z2];
                    }
                    ctx.fillStyle = Theme.ink;
                    for (let lat = -75; lat <= 75; lat += 15)
                        for (let lon = 0; lon < 360; lon += 4) {
                            const p = proj(lat, lon);
                            if (p[2] > 0) { ctx.globalAlpha = 0.15 + p[2] * 0.55; ctx.fillRect(p[0], p[1], 1.4, 1.4); }
                        }
                    for (let lon = 0; lon < 360; lon += 20)
                        for (let lat = -88; lat <= 88; lat += 4) {
                            const p = proj(lat, lon);
                            if (p[2] > 0) { ctx.globalAlpha = 0.1 + p[2] * 0.4; ctx.fillRect(p[0], p[1], 1.2, 1.2); }
                        }
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = Theme.teal;
                    for (const r of globeBox.rings) {
                        const p = proj(r.lat, r.lon);
                        if (p[2] <= 0) continue;
                        ctx.globalAlpha = Math.max(0, 1 - r.t);
                        ctx.beginPath(); ctx.arc(p[0], p[1], 4 + r.t * 26, 0, Math.PI * 2); ctx.stroke();
                        ctx.fillStyle = Theme.teal; ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
                    }
                    ctx.globalAlpha = 1;
                }
            }
            Timer {
                interval: 66
                repeat: true
                running: content.visible && !Theme.reduceMotion && !Theme.gameMode
                onTriggered: {
                    globeBox.rot += 0.006;
                    const next = [];
                    for (const r of globeBox.rings) { r.t += 0.025; if (r.t < 1) next.push(r); }
                    globeBox.rings = next;
                    globe.requestPaint();
                }
            }
            Text {
                anchors { left: parent.left; bottom: parent.bottom; leftMargin: 12; bottomMargin: 8 }
                text: "NET // " + (State.netName !== "" ? State.netName.toUpperCase() : "OFFLINE") + (State.netPing >= 0 ? "  ·  " + State.netPing + " MS" : "")
                color: State.netName !== "" ? Theme.teal : Theme.coral
                font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1.2
            }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Quickshell.execDetached(["hyperina", "open", "netrecon"]) }
            Connections {
                target: Ui
                function onHudPing() {
                    globeBox.rings = globeBox.rings.concat([{ lat: -40 + Math.random() * 80, lon: Math.random() * 360, t: 0 }]);
                    Ui.pushLog("> PING ..................... " + (State.netPing >= 0 ? State.netPing + " ms" : "—"));
                }
            }
        }

        // ── журнал событий ───────────────────────────────────────────
        Column {
            visible: Theme.s.desktop ? Theme.s.desktop.hud_log !== false : true
            anchors { left: parent.left; bottom: parent.bottom; leftMargin: parent.width * 0.36; bottomMargin: 96 }
            spacing: 3
            Repeater {
                model: Ui.logLines
                Row {
                    id: logRow
                    required property var modelData
                    required property int index
                    spacing: 10
                    opacity: 0.45 + 0.55 * (index + 1) / Math.max(1, Ui.logLines.length)
                    Text { text: logRow.modelData.t; color: Theme.lineHi; font.family: Theme.fontMono; font.pixelSize: 10 }
                    DecodeText { target: logRow.modelData.text; color: Theme.dim; font.pixelSize: 10; font.letterSpacing: 0.6 }
                }
            }
        }

        // микроглитч подписи по событию
        Connections {
            target: Ui
            function onHudGlitch() { glitchAnim.restart(); }
        }
        SequentialAnimation {
            id: glitchAnim
            NumberAnimation { target: dossier; property: "x"; to: dossier.x - 6; duration: 30 }
            NumberAnimation { target: dossier; property: "x"; to: dossier.x + 4; duration: 30 }
            NumberAnimation { target: dossier; property: "opacity"; to: 0.4; duration: 20 }
            NumberAnimation { target: dossier; property: "opacity"; to: 1; duration: 20 }
        }
    }
}
