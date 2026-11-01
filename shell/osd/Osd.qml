import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import "../theme"
import "../services"
import "../components"

// Экранные индикаторы громкости, микрофона и яркости
Scope {
    id: root
    PwObjectTracker { objects: [Pipewire.defaultAudioSink, Pipewire.defaultAudioSource] }

    function volume(action) {
        const sink = Pipewire.defaultAudioSink;
        if (!sink || !sink.audio) return;
        if (action === "up") { sink.audio.muted = false; sink.audio.volume = Math.min(1.0, sink.audio.volume + 0.05); }
        else if (action === "down") sink.audio.volume = Math.max(0, sink.audio.volume - 0.05);
        else if (action === "mute") sink.audio.muted = !sink.audio.muted;
        Ui.showOsd("volume", sink.audio.volume, sink.audio.muted);
    }
    function mic(action) {
        const src = Pipewire.defaultAudioSource;
        if (!src || !src.audio) return;
        src.audio.muted = !src.audio.muted;
        Ui.showOsd("mic", src.audio.muted ? 0 : 1, src.audio.muted);
    }
    function brightness(action) {
        bright.command = ["sh", "-c", "brightnessctl -e4 -n2 set 5%" + (action === "up" ? "+" : "-") + " >/dev/null; brightnessctl -m"];
        bright.running = true;
    }
    Process {
        id: bright
        stdout: StdioCollector {
            onStreamFinished: {
                const parts = text.trim().split(",");
                const pct = parts.length > 3 ? parseInt(parts[3]) : 50;
                Ui.showOsd("brightness", pct / 100, false);
            }
        }
    }

    PanelWindow {
        id: osd
        visible: hideTimer.running
        anchors.bottom: true
        margins { bottom: 96 }
        implicitWidth: 340
        implicitHeight: 54
        exclusionMode: ExclusionMode.Ignore
        color: "transparent"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.namespace: "hyperina-osd"

        Connections {
            target: Ui
            function onOsdSerialChanged() { hideTimer.restart(); }
        }
        Timer { id: hideTimer; interval: 1400 }

        HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg1, 0.96); stroke: Theme.lineHi }
        Row {
            anchors.centerIn: parent
            spacing: 14
            Glyph {
                anchors.verticalCenter: parent.verticalCenter
                size: 20
                name: Ui.osdKind === "brightness" ? "sun" : (Ui.osdKind === "mic" ? "mic" : (Ui.osdMuted ? "mute" : "volume"))
                color: Ui.osdMuted ? Theme.coral : Theme.ink
            }
            SegBar {
                anchors.verticalCenter: parent.verticalCenter
                width: 200
                count: 20
                segHeight: 10
                value: Ui.osdMuted ? 0 : Ui.osdValue
                fillColor: Ui.osdKind === "brightness" ? Theme.amber : Theme.accent
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                width: 44
                text: Ui.osdMuted ? "MUTE" : Math.round(Ui.osdValue * 100) + "%"
                color: Ui.osdMuted ? Theme.coral : Theme.ink
                font.family: Theme.fontMono; font.pixelSize: 12
                font.features: { "tnum": 1 }
            }
        }
    }
}
