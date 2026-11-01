pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import "../theme"
import "../services"

// Живые обои: полутоновая статуя «дышит», мерцают звёзды, падают звёзды и камешки,
// пролетает спутник, дрейфует пыль. Всё замирает в игре, на батарее и при полноэкранных окнах.
PanelWindow {
    id: wall
    required property var modelData
    screen: modelData
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: Theme.bg0
    WlrLayershell.layer: WlrLayer.Background
    WlrLayershell.namespace: "hyperina-wallpaper"

    readonly property string dir: Theme.dataDir + "/wallpapers/current/"
    property var meta: ({ size: [2560, 1600], statue: { x: 115, y: 264, w: 762, h: 1278 }, ground: 1550, edges: [] })
    readonly property real k: width / meta.size[0]
    readonly property var monitor: Hyprland.monitorFor(wall.screen)
    readonly property bool fullscreenHere: monitor && monitor.activeWorkspace ? monitor.activeWorkspace.hasFullscreen : false
    readonly property bool batteryPause: Theme.onBattery && (Theme.effects.battery_pause !== false)
    readonly property bool live: Theme.wallpaper.live !== false && !Theme.reduceMotion && !fullscreenHere && !batteryPause && Theme.liveliness > 0.01
    readonly property real lively: Theme.liveliness

    FileView {
        path: wall.dir + "meta.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: { try { wall.meta = JSON.parse(text()); } catch (e) { } }
    }

    // ── база и статуя ────────────────────────────────────────────
    Image {
        anchors.fill: parent
        source: "file://" + wall.dir + "base.png"
        fillMode: Image.PreserveAspectCrop
        cache: false
        asynchronous: true
    }

    Item {
        id: statue
        x: wall.meta.statue.x * wall.k
        y: wall.meta.statue.y * wall.k
        width: wall.meta.statue.w * wall.k
        height: wall.meta.statue.h * wall.k
        property int phase: 0
        Repeater {
            model: 3
            Image {
                required property int index
                anchors.fill: parent
                source: "file://" + wall.dir + "statue-" + index + ".png"
                smooth: false
                cache: false
                opacity: statue.phase === index ? 1 : 0
                Behavior on opacity { NumberAnimation { duration: 3600; easing.type: Easing.InOutSine } }
            }
        }
        Timer {
            interval: 4200
            repeat: true
            running: wall.live
            onTriggered: statue.phase = (statue.phase + 1) % 3
        }
    }

    // ── зерно ────────────────────────────────────────────────────
    Image {
        id: grain
        x: -256; y: -256
        width: parent.width + 512; height: parent.height + 512
        source: "file://" + wall.dir + "grain.png"
        fillMode: Image.Tile
        opacity: Math.min(0.6, Theme.grain * 10)
        Timer {
            interval: 83
            repeat: true
            running: wall.live && Theme.grain > 0
            onTriggered: { grain.x = -Math.random() * 256; grain.y = -Math.random() * 256; }
        }
    }

    // ── звёзды ───────────────────────────────────────────────────
    Repeater {
        id: stars
        model: 90
        Rectangle {
            id: star
            required property int index
            readonly property real rx: ((index * 7919) % 1000) / 1000
            readonly property real ry: ((index * 104729) % 1000) / 1000
            x: wall.width * (0.30 + rx * 0.68)
            y: wall.height * (0.05 + ry * 0.70)
            width: index % 11 === 0 ? 2 : 1
            height: width
            color: index % 17 === 0 ? Theme.teal : (index % 13 === 0 ? Theme.violet : Theme.ink)
            opacity: 0.25 + (index % 5) * 0.1
            SequentialAnimation on opacity {
                running: wall.live
                loops: Animation.Infinite
                PauseAnimation { duration: 400 + (star.index * 37) % 3000 }
                NumberAnimation { to: 0.1; duration: 1400 + (star.index * 53) % 2200; easing.type: Easing.InOutSine }
                NumberAnimation { to: 0.35 + (star.index % 5) * 0.12; duration: 1400 + (star.index * 29) % 2200; easing.type: Easing.InOutSine }
            }
        }
    }

    // ── пыль в луче света над статуей ────────────────────────────
    Repeater {
        id: motes
        model: 26
        Rectangle {
            id: mote
            required property int index
            width: 1.5; height: 1.5
            color: Theme.ink
            opacity: 0.12 + (index % 4) * 0.08
            x: statue.x + statue.width * (0.1 + ((index * 37) % 100) / 120)
            y: statue.y + statue.height * (((index * 53) % 100) / 140)
            property real gust: 1
            Timer {
                interval: 2800 + (mote.index * 97) % 2400
                repeat: true
                running: wall.live
                triggeredOnStart: true
                onTriggered: {
                    mote.x = Math.max(0, mote.x + (Math.random() - 0.4) * 46 * mote.gust);
                    mote.y = Math.max(0, mote.y + (Math.random() - 0.35) * 34 * mote.gust);
                }
            }
            Behavior on x { NumberAnimation { duration: 2800 / mote.gust; easing.type: Easing.InOutSine } }
            Behavior on y { NumberAnimation { duration: 2800 / mote.gust; easing.type: Easing.InOutSine } }
        }
    }

    // ── линия скана ──────────────────────────────────────────────
    Rectangle {
        id: scanLine
        width: parent.width; height: 1
        color: Theme.ink
        opacity: 0
        NumberAnimation on y { id: scanAnim; running: false; from: 0; to: wall.height; duration: 1600 / Theme.scanSpeed }
        SequentialAnimation {
            id: scanFade
            NumberAnimation { target: scanLine; property: "opacity"; to: 0.22; duration: 150 }
            PauseAnimation { duration: 1600 / Theme.scanSpeed - 300 }
            NumberAnimation { target: scanLine; property: "opacity"; to: 0; duration: 150 }
        }
    }

    // ── компоненты событий ───────────────────────────────────────
    Component {
        id: meteorComp
        Item {
            id: m
            property real angle: 18 + Math.random() * 20
            property real len: 90 + Math.random() * 90
            x: wall.width * (0.35 + Math.random() * 0.55)
            y: wall.height * (0.03 + Math.random() * 0.25)
            rotation: angle
            transformOrigin: Item.Left
            Rectangle {
                width: m.len; height: 1.5
                x: -m.len
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: "transparent" }
                    GradientStop { position: 1.0; color: Theme.ink }
                }
            }
            Rectangle { width: 2.5; height: 2.5; color: Theme.ink; y: -0.5 }
            ParallelAnimation {
                running: true
                NumberAnimation { target: m; property: "x"; to: m.x + Math.cos(m.angle * Math.PI / 180) * 520; duration: 640; easing.type: Easing.InQuad }
                NumberAnimation { target: m; property: "y"; to: m.y + Math.sin(m.angle * Math.PI / 180) * 520; duration: 640; easing.type: Easing.InQuad }
                SequentialAnimation {
                    PauseAnimation { duration: 380 }
                    NumberAnimation { target: m; property: "opacity"; to: 0; duration: 260 }
                }
                onFinished: m.destroy()
            }
        }
    }

    Component {
        id: pebbleComp
        Item {
            id: pb
            property real sx: 0
            property real sy: 0
            property real ground: wall.meta.ground * wall.k - 4
            property real drift: (Math.random() - 0.5) * 60
            x: sx; y: sy
            width: 7; height: 7
            Canvas {
                id: dots
                anchors.fill: parent
                onPaint: {
                    const ctx = getContext("2d");
                    ctx.fillStyle = Theme.ink;
                    const pts = [[1,2],[3,1],[5,2],[2,4],[4,4],[3,6],[5,5]];
                    for (const p of pts) if (Math.random() > 0.15) ctx.fillRect(p[0], p[1], 1.4, 1.4);
                }
            }
            // вспышка трещины в точке отрыва
            Item {
                x: 3; y: 3
                NumberAnimation on opacity { from: 1; to: 0; duration: 480 }
                Rectangle { width: 10; height: 1; x: -5; color: Theme.ink; rotation: 30 }
                Rectangle { width: 8; height: 1; x: -4; color: Theme.ink; rotation: -40 }
            }
            SequentialAnimation {
                running: true
                ParallelAnimation {
                    NumberAnimation { target: pb; property: "y"; to: pb.ground; duration: 280 + Math.sqrt(Math.max(1, pb.ground - pb.sy)) * 22; easing.type: Easing.InQuad }
                    NumberAnimation { target: pb; property: "x"; to: pb.sx + pb.drift; duration: 600 }
                    NumberAnimation { target: pb; property: "rotation"; to: 180 + Math.random() * 180; duration: 700 }
                }
                ScriptAction { script: wall.dust(pb.x + 3, pb.ground + 4) }
                NumberAnimation { target: pb; property: "y"; to: pb.ground - 14; duration: 170; easing.type: Easing.OutQuad }
                NumberAnimation { target: pb; property: "y"; to: pb.ground; duration: 170; easing.type: Easing.InQuad }
                NumberAnimation { target: pb; property: "y"; to: pb.ground - 4; duration: 90; easing.type: Easing.OutQuad }
                NumberAnimation { target: pb; property: "y"; to: pb.ground; duration: 90; easing.type: Easing.InQuad }
                PauseAnimation { duration: 3200 }
                NumberAnimation { target: pb; property: "opacity"; to: 0; duration: 900 }
                ScriptAction { script: pb.destroy() }
            }
        }
    }

    Component {
        id: dustComp
        Rectangle {
            id: dp
            property real dx: (Math.random() - 0.5) * 34
            property real dy: -Math.random() * 16
            width: 1.5; height: 1.5
            color: Theme.ink
            ParallelAnimation {
                running: true
                NumberAnimation { target: dp; property: "x"; to: dp.x + dp.dx; duration: 700; easing.type: Easing.OutQuad }
                NumberAnimation { target: dp; property: "y"; to: dp.y + dp.dy; duration: 700; easing.type: Easing.OutQuad }
                NumberAnimation { target: dp; property: "opacity"; to: 0; duration: 700 }
                onFinished: dp.destroy()
            }
        }
    }

    Component {
        id: satComp
        Rectangle {
            id: sat
            width: 2; height: 2
            color: Theme.ink
            y: wall.height * (0.06 + Math.random() * 0.22)
            SequentialAnimation on opacity {
                loops: Animation.Infinite
                NumberAnimation { to: 0.2; duration: 500 }
                NumberAnimation { to: 0.9; duration: 500 }
            }
            NumberAnimation on x {
                from: -10
                to: wall.width + 10
                duration: 22000
                onFinished: sat.destroy()
            }
        }
    }

    function dust(px, py) {
        for (let i = 0; i < 9; i++) dustComp.createObject(wall.contentItem, { x: px, y: py });
    }

    // ── события ──────────────────────────────────────────────────
    function event(name) {
        switch (name) {
        case "meteor":
            meteorComp.createObject(wall.contentItem);
            Ui.pushLog("> ATMOSPHERIC ENTRY ........ 0.4s");
            break;
        case "pebble": {
            const e = wall.meta.edges;
            if (!e || e.length === 0) return;
            const p = e[Math.floor(Math.random() * e.length)];
            pebbleComp.createObject(wall.contentItem, { sx: p[0] * wall.k, sy: p[1] * wall.k });
            Ui.pushLog("> STRUCTURAL LOSS .......... 0.02%");
            break;
        }
        case "satellite":
            satComp.createObject(wall.contentItem);
            Ui.pushLog("> ORBITAL OBJECT ........... TRACKED");
            break;
        case "scan":
            scanAnim.restart(); scanFade.restart();
            Ui.pushLog("> PERIMETER SCAN ........... CLEAR");
            break;
        case "ping":
            Ui.hudPing();
            break;
        case "glitch":
            Ui.hudGlitch();
            break;
        case "gust":
            for (let i = 0; i < motes.count; i++) { const m = motes.itemAt(i); if (m) m.gust = 3.2; }
            gustReset.restart();
            Ui.pushLog("> PARTICLE FLOW ............ ↑");
            break;
        case "flare": {
            const s = stars.itemAt(Math.floor(Math.random() * 90));
            if (s) { s.opacity = 1; s.scale = 3; flareReset.target = s; flareReset.restart(); }
            break;
        }
        }
    }
    Timer {
        id: gustReset
        interval: 1600
        onTriggered: { for (let i = 0; i < motes.count; i++) { const m = motes.itemAt(i); if (m) m.gust = 1; } }
    }
    SequentialAnimation {
        id: flareReset
        property var target: null
        PauseAnimation { duration: 220 }
        ScriptAction { script: if (flareReset.target) { flareReset.target.scale = 1; flareReset.target.opacity = 0.3; } }
    }

    readonly property var weights: [["meteor", 3], ["pebble", 2 + Math.min(2, State.uptimeDays / 4)], ["satellite", 1.5],
        ["ping", 2], ["glitch", 1.5], ["gust", 1], ["scan", 1], ["flare", 1.5]]
    function pick() {
        let total = 0;
        for (const w of weights) total += w[1];
        let r = Math.random() * total;
        for (const w of weights) { r -= w[1]; if (r <= 0) return w[0]; }
        return "meteor";
    }
    Timer {
        id: scheduler
        running: wall.live
        repeat: true
        interval: 9000
        onTriggered: {
            wall.event(wall.pick());
            const factor = Math.max(0.35, (1.35 - wall.lively) / 0.7);
            interval = (6000 + Math.random() * 19000) * factor;
        }
    }
}
