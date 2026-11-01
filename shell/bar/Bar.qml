pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Services.Pipewire
import Quickshell.Services.SystemTray
import Quickshell.Widgets
import "../theme"
import "../services"
import "../components"

// Верхняя панель: досье системы, рабочие столы, живые показатели, часы, Haotica
PanelWindow {
    id: bar
    Component.onCompleted: Ui.reg("bar", bar)
    required property var modelData
    screen: modelData
    anchors { top: true; left: true; right: true }
    implicitHeight: 34
    exclusiveZone: 34
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "haotica-bar"

    readonly property int wsCount: (Theme.s.desktop && Theme.s.desktop.workspaces) ? Theme.s.desktop.workspaces : 6
    readonly property var monitor: Hyprland.monitorFor(bar.screen)

    Rectangle { anchors.fill: parent; color: Theme.alpha(Theme.bg0, 0.88) }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
    Rectangle { x: 0; y: parent.height - 3; width: 5; height: 5; color: Theme.ink }

    SystemClock { id: clock; precision: SystemClock.Seconds }
    PwObjectTracker { objects: [Pipewire.defaultAudioSink] }

    // ── левая часть ──────────────────────────────────────────────
    RowLayout {
        anchors { left: parent.left; leftMargin: 14; verticalCenter: parent.verticalCenter }
        spacing: 14

        MouseArea {
            implicitWidth: brand.implicitWidth
            implicitHeight: 20
            cursorShape: Qt.PointingHandCursor
            onClicked: Ui.dashboardOpen = !Ui.dashboardOpen
            Row {
                id: brand
                spacing: 8
                anchors.verticalCenter: parent.verticalCenter
                Text { text: "HAOTICA"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 12; font.weight: Font.DemiBold; font.letterSpacing: 2 }
                Text { text: "//"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 12 }
                Text {
                    text: "SYSTEM: " + (Core.coreOnline ? "ONLINE" : "BOOT")
                    color: Core.coreOnline ? Theme.green : Theme.amber
                    font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.2
                }
            }
        }

        Row {
            spacing: 4
            Repeater {
                model: bar.wsCount
                Item {
                    id: chip
                    required property int index
                    readonly property int wsId: index + 1
                    readonly property var ws: {
                        const all = Hyprland.workspaces.values;
                        for (let i = 0; i < all.length; i++) if (all[i].id === chip.wsId) return all[i];
                        return null;
                    }
                    readonly property bool active: bar.monitor && bar.monitor.activeWorkspace && bar.monitor.activeWorkspace.id === wsId
                    readonly property bool occupied: ws !== null && ws.toplevels.values.length > 0
                    width: active ? 30 : 18; height: 18
                    Behavior on width { NumberAnimation { duration: Theme.ms(180); easing.type: Easing.OutCubic } }
                    HFrame {
                        anchors.fill: parent
                        cut: 4; nodes: false
                        fill: chip.active ? Theme.accent : "transparent"
                        stroke: chip.active ? Theme.accent : (chip.occupied ? Theme.lineHi : Theme.line)
                    }
                    Text {
                        anchors.centerIn: parent
                        text: chip.wsId
                        color: chip.active ? Theme.bg0 : (chip.occupied ? Theme.ink : Theme.dim)
                        font.family: Theme.fontMono; font.pixelSize: 10; font.weight: Font.DemiBold
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (chip.ws) chip.ws.activate();
                            else Hyprland.dispatch(Hyprland.usingLua ? "hl.dsp.focus({ workspace = " + chip.wsId + " })" : "workspace " + chip.wsId);
                        }
                    }
                }
            }
        }

        Text {
            Layout.maximumWidth: 420
            text: Hyprland.activeToplevel ? Hyprland.activeToplevel.title : ""
            color: Theme.dim
            elide: Text.ElideRight
            font.family: Theme.fontMono; font.pixelSize: 11
        }
    }

    // ── правая часть ─────────────────────────────────────────────
    RowLayout {
        anchors { right: parent.right; rightMargin: 12; verticalCenter: parent.verticalCenter }
        spacing: 14

        Row {
            spacing: 6
            Text { text: "CPU"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; anchors.verticalCenter: parent.verticalCenter }
            Sparkline { width: 46; height: 16; values: Core.cpuHistory; color: Theme.teal; grid: false }
            Text { text: Math.round(Core.cpu) + "%"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11; anchors.verticalCenter: parent.verticalCenter; width: 32 }
        }
        Row {
            spacing: 6
            Text { text: "GPU"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; anchors.verticalCenter: parent.verticalCenter }
            Sparkline { width: 46; height: 16; values: Core.gpuHistory; color: Theme.coral; grid: false }
            Text { text: Math.round(Core.gpu) + "%"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11; anchors.verticalCenter: parent.verticalCenter; width: 32 }
        }
        Text {
            text: "GTT " + Core.gttUsed.toFixed(0) + "/" + Core.gttTotal.toFixed(0) + "G"
            color: Core.gttUsed > Core.gttTotal * 0.9 ? Theme.amber : Theme.ink
            font.family: Theme.fontMono; font.pixelSize: 11
        }
        Item {
            implicitWidth: wifiRow.implicitWidth; implicitHeight: wifiRow.implicitHeight
            Row {
                id: wifiRow
                spacing: 5
                Glyph { name: "wifi"; size: 15; color: Core.netName !== "" ? Theme.teal : Theme.dim; anchors.verticalCenter: parent.verticalCenter }
                Text {
                    text: Core.netName !== "" ? (Core.netPing >= 0 ? Core.netPing + " ms" : "") : "offline"
                    color: Core.netName !== "" ? Theme.ink : Theme.coral
                    font.family: Theme.fontMono; font.pixelSize: 11
                    anchors.verticalCenter: parent.verticalCenter
                }
            }
            MouseArea { anchors.fill: parent; onClicked: Ui.controlOpen = !Ui.controlOpen; cursorShape: Qt.PointingHandCursor }
        }
        Row {
            visible: Core.battery >= 0
            spacing: 5
            Glyph { name: Core.charging ? "bolt" : "battery"; size: 15; color: Core.battery < 15 && !Core.charging ? Theme.coral : Theme.ink; anchors.verticalCenter: parent.verticalCenter }
            Text { text: Math.round(Core.battery) + "%"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11; anchors.verticalCenter: parent.verticalCenter }
        }
        Text {
            text: Core.kbLayout.toUpperCase()
            color: Theme.ink
            font.family: Theme.fontMono; font.pixelSize: 11; font.weight: Font.DemiBold
        }
        Row {
            spacing: 5
            readonly property var sink: Pipewire.defaultAudioSink
            readonly property bool muted: sink && sink.audio ? sink.audio.muted : false
            Glyph { name: parent.muted ? "mute" : "volume"; size: 15; color: parent.muted ? Theme.dim : Theme.ink; anchors.verticalCenter: parent.verticalCenter }
            Text {
                text: parent.sink && parent.sink.audio ? Math.round(parent.sink.audio.volume * 100) + "%" : "--"
                color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11
                anchors.verticalCenter: parent.verticalCenter
            }
        }
        Row {
            spacing: 6
            Repeater {
                model: SystemTray.items
                IconImage {
                    id: trayIcon
                    required property var modelData
                    implicitSize: 16
                    source: modelData.icon
                    MouseArea {
                        anchors.fill: parent
                        acceptedButtons: Qt.LeftButton | Qt.RightButton
                        onClicked: mouse => {
                            if (mouse.button === Qt.RightButton || trayIcon.modelData.onlyMenu) trayIcon.modelData.display(bar, trayIcon.x, bar.height);
                            else trayIcon.modelData.activate();
                        }
                    }
                }
            }
        }
        Text {
            text: Qt.formatDateTime(clock.date, "ddd dd.MM").toUpperCase() + "  " + Qt.formatDateTime(clock.date, "HH:mm:ss")
            color: Theme.ink
            font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 0.6
            font.features: { "tnum": 1 }
            MouseArea { anchors.fill: parent; onClicked: Ui.notificationsOpen = !Ui.notificationsOpen; cursorShape: Qt.PointingHandCursor }
        }
        // Haotica: ромб меняет цвет по состоянию, клик — окно Haotica
        Item {
            id: orb
            implicitWidth: 22; implicitHeight: 22
            readonly property string st: Core.haotica.state || "idle"
            readonly property color col: st === "warning" ? Theme.coral : (st === "sleep" ? Theme.dim : Theme.violet)
            Glyph { anchors.centerIn: parent; name: "haotica"; size: 18; color: orb.col }
            SequentialAnimation on opacity {
                running: orb.st === "thinking" || orb.st === "speaking"
                loops: Animation.Infinite
                NumberAnimation { to: 0.35; duration: 420 }
                NumberAnimation { to: 1; duration: 420 }
                onStopped: orb.opacity = 1
            }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Quickshell.execDetached(["haotica", "open", "assistant", "--toggle"]) }
        }
    }
}
