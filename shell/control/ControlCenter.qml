pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Networking
import Quickshell.Bluetooth
import Quickshell.Services.Pipewire
import Quickshell.Services.UPower
import "../theme"
import "../services"
import "../components"

// Центр управления: Wi-Fi, Bluetooth, звук, яркость, питание, быстрые переключатели
PanelWindow {
    id: cc
    Component.onCompleted: Ui.reg("control", cc)
    visible: Ui.controlOpen
    anchors { top: true; right: true }
    margins { top: 40; right: 10 }
    implicitWidth: 400
    implicitHeight: body.implicitHeight + 28
    exclusionMode: ExclusionMode.Ignore
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "haotica-control"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None

    PwObjectTracker { objects: [Pipewire.defaultAudioSink] }
    readonly property var wifi: {
        const d = Networking.devices.values;
        for (let i = 0; i < d.length; i++) if (d[i].type === DeviceType.Wifi) return d[i];
        return null;
    }
    property string pskFor: ""

    HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg0, 0.96); stroke: Theme.lineHi }

    ColumnLayout {
        id: body
        x: 14; y: 14
        width: parent.width - 28
        spacing: 12

        RowLayout {
            Text { text: "CONTROL // ЦЕНТР УПРАВЛЕНИЯ"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.6; Layout.fillWidth: true }
            Text { text: "×"; color: Theme.dim; font.pixelSize: 18; MouseArea { anchors.fill: parent; onClicked: Ui.controlOpen = false } }
        }

        // быстрые плитки
        GridLayout {
            Layout.fillWidth: true
            columns: 3
            columnSpacing: 8; rowSpacing: 8
            component Tile: Item {
                id: tile
                property string label: ""
                property string glyph: "sparkle"
                property bool on: false
                property color onColor: Theme.accent
                signal clicked()
                Layout.fillWidth: true
                implicitHeight: 54
                HFrame { anchors.fill: parent; cut: 6; nodes: false; fill: tile.on ? Theme.alpha(tile.onColor, 0.16) : "transparent"; stroke: tile.on ? tile.onColor : Theme.line }
                Column {
                    anchors.centerIn: parent
                    spacing: 4
                    Glyph { anchors.horizontalCenter: parent.horizontalCenter; name: tile.glyph; size: 18; color: tile.on ? tile.onColor : Theme.dim }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: tile.label; color: tile.on ? Theme.ink : Theme.dim; font.family: Theme.fontMono; font.pixelSize: 9; font.letterSpacing: 1 }
                }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: tile.clicked() }
            }
            Tile { label: "WI-FI"; glyph: "wifi"; on: Networking.wifiEnabled; onColor: Theme.teal; onClicked: Networking.wifiEnabled = !Networking.wifiEnabled }
            Tile {
                label: "BLUETOOTH"; glyph: "bluetooth"; onColor: Theme.sky
                on: Bluetooth.defaultAdapter ? Bluetooth.defaultAdapter.enabled : false
                onClicked: if (Bluetooth.defaultAdapter) Bluetooth.defaultAdapter.enabled = !Bluetooth.defaultAdapter.enabled
            }
            Tile { label: "НЕ БЕСПОКОИТЬ"; glyph: "dnd"; on: Ui.dnd; onColor: Theme.amber; onClicked: Ui.dnd = !Ui.dnd }
            Tile {
                label: "НОЧНОЙ"; glyph: "night"; onColor: Theme.amber
                on: Theme.s.display ? Theme.s.display.night_light === true : false
                onClicked: Core.setSetting("display.night_light", !on)
            }
            Tile { label: "ИГРА"; glyph: "game"; on: Core.gameMode; onColor: Theme.coral; onClicked: Quickshell.execDetached(["haotica", "gamemode", "toggle"]) }
            Tile { label: "HAOTICA"; glyph: "haotica"; on: (Core.haotica.state || "") !== "sleep"; onColor: Theme.violet; onClicked: Quickshell.execDetached(["haotica", "open", "assistant", "--toggle"]) }
        }

        // режим питания
        Row {
            spacing: 6
            Repeater {
                model: [[PowerProfile.PowerSaver, "ТИХИЙ"], [PowerProfile.Balanced, "БАЛАНС"], [PowerProfile.Performance, "МОЩНОСТЬ"]]
                HButton {
                    required property var modelData
                    text: modelData[1]
                    checked: PowerProfiles.profile === modelData[0]
                    onClicked: PowerProfiles.profile = modelData[0]
                }
            }
        }

        // звук
        RowLayout {
            spacing: 10
            Glyph { name: "volume"; size: 16; color: Theme.dim }
            HSlider {
                Layout.fillWidth: true
                value: Pipewire.defaultAudioSink && Pipewire.defaultAudioSink.audio ? Pipewire.defaultAudioSink.audio.volume : 0
                onMoved: v => { if (Pipewire.defaultAudioSink && Pipewire.defaultAudioSink.audio) Pipewire.defaultAudioSink.audio.volume = v; }
            }
        }

        // Wi-Fi сети
        Text { text: "СЕТИ"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1.4 }
        Column {
            Layout.fillWidth: true
            spacing: 2
            Repeater {
                model: cc.wifi ? cc.wifi.networks : null
                Item {
                    id: net
                    required property var modelData
                    width: body.width
                    height: 30
                    Rectangle { anchors.fill: parent; color: mouseNet.containsMouse ? Theme.hover : "transparent" }
                    Row {
                        x: 6; anchors.verticalCenter: parent.verticalCenter
                        spacing: 8
                        SegBar { width: 28; count: 4; segHeight: 8; value: net.modelData.signalStrength; fillColor: net.modelData.connected ? Theme.teal : Theme.dim; anchors.verticalCenter: parent.verticalCenter }
                        Text { text: net.modelData.name; color: net.modelData.connected ? Theme.ink : Theme.dim; font.family: Theme.fontUi; font.pixelSize: 12; anchors.verticalCenter: parent.verticalCenter }
                    }
                    Text {
                        anchors { right: parent.right; rightMargin: 6; verticalCenter: parent.verticalCenter }
                        text: net.modelData.connected ? "ПОДКЛЮЧЕНО" : (net.modelData.known ? "ИЗВЕСТНАЯ" : "")
                        color: net.modelData.connected ? Theme.teal : Theme.dim
                        font.family: Theme.fontMono; font.pixelSize: 9
                    }
                    MouseArea {
                        id: mouseNet
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            if (net.modelData.connected) net.modelData.disconnect();
                            else if (net.modelData.known) net.modelData.connect();
                            else cc.pskFor = net.modelData.name;
                        }
                    }
                }
            }
        }
        RowLayout {
            visible: cc.pskFor !== ""
            spacing: 8
            Text { text: "ПАРОЛЬ:"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10 }
            Rectangle {
                Layout.fillWidth: true
                height: 26
                color: Theme.bg0
                border.color: Theme.line
                TextInput {
                    id: psk
                    anchors.fill: parent; anchors.margins: 6
                    echoMode: TextInput.Password
                    color: Theme.ink
                    font.family: Theme.fontMono; font.pixelSize: 12
                    onAccepted: {
                        const nets = cc.wifi ? cc.wifi.networks.values : [];
                        for (let i = 0; i < nets.length; i++) if (nets[i].name === cc.pskFor) nets[i].connectWithPsk(text);
                        cc.pskFor = ""; text = "";
                    }
                }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.line }
        Row {
            spacing: 6
            HButton { glyph: "settings"; text: "Настройки"; onClicked: { Ui.controlOpen = false; Quickshell.execDetached(["haotica", "open", "settings"]); } }
            HButton { glyph: "radar"; text: "Сеть"; onClicked: { Ui.controlOpen = false; Quickshell.execDetached(["haotica", "open", "netrecon"]); } }
            HButton { glyph: "power"; onClicked: { Ui.controlOpen = false; Ui.powerOpen = true; } }
        }
    }
}
