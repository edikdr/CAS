pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import "../theme"
import "../services"
import "../components"

// Меню питания: блокировка, сон, перезагрузка, выключение, выход. Перед действием — CRT-гашение экрана
PanelWindow {
    id: pm
    visible: Ui.powerOpen
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: Theme.alpha(Theme.bg0, 0.82)
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "haotica-power"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

    signal lockRequested()
    property int sel: 0
    readonly property var items: [
        ["lock", "lock", "БЛОКИРОВКА"], ["sleep", "sleep", "СОН"], ["reboot", "reboot", "ПЕРЕЗАГРУЗКА"],
        ["poweroff", "power", "ВЫКЛЮЧЕНИЕ"], ["logout", "logout", "ВЫХОД"]
    ]

    function run(id) {
        Ui.powerOpen = false;
        if (id === "lock") { pm.lockRequested(); return; }
        crt.what = id;
        crt.start();
    }

    onVisibleChanged: if (visible) { sel = 0; focusItem.forceActiveFocus(); }

    Item {
        id: focusItem
        anchors.fill: parent
        focus: true
        Keys.onEscapePressed: Ui.powerOpen = false
        Keys.onLeftPressed: pm.sel = Math.max(0, pm.sel - 1)
        Keys.onRightPressed: pm.sel = Math.min(pm.items.length - 1, pm.sel + 1)
        Keys.onReturnPressed: pm.run(pm.items[pm.sel][0])
        MouseArea { anchors.fill: parent; onClicked: Ui.powerOpen = false }
    }

    Column {
        anchors.centerIn: parent
        spacing: 26
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "POWER"
            color: Theme.ink
            font.family: Theme.fontDisplay; font.pixelSize: 64; font.weight: Font.Black
        }
        Row {
            spacing: 14
            Repeater {
                model: pm.items
                Item {
                    id: it
                    required property var modelData
                    required property int index
                    width: 140; height: 140
                    readonly property bool cur: pm.sel === index
                    HFrame { anchors.fill: parent; fill: it.cur ? Theme.alpha(Theme.accent, 0.14) : Theme.alpha(Theme.bg1, 0.9); stroke: it.cur ? Theme.accent : Theme.line }
                    Column {
                        anchors.centerIn: parent
                        spacing: 12
                        Glyph { anchors.horizontalCenter: parent.horizontalCenter; name: it.modelData[1]; size: 36; color: it.cur ? Theme.accent : Theme.ink }
                        Text { anchors.horizontalCenter: parent.horizontalCenter; text: it.modelData[2]; color: it.cur ? Theme.ink : Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1.4 }
                    }
                    Brackets { active: it.cur }
                    MouseArea { anchors.fill: parent; hoverEnabled: true; onEntered: pm.sel = it.index; onClicked: pm.run(it.modelData[0]) }
                }
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "◀▶ : ВЫБОР   ⏎ : ПОДТВЕРДИТЬ   ESC : НАЗАД"
            color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1.2
        }
    }

    // CRT-гашение перед действием (оверлей на весь экран)
    PanelWindow {
        id: crtWin
        visible: crt.running
        anchors { top: true; bottom: true; left: true; right: true }
        exclusionMode: ExclusionMode.Ignore
        color: "transparent"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.namespace: "haotica-overlay"
        Rectangle { id: topCurtain; width: parent.width; height: 0; color: "black" }
        Rectangle { id: botCurtain; width: parent.width; height: 0; y: parent.height - height; color: "black" }
        Rectangle { id: beam; anchors.centerIn: parent; width: parent.width; height: 2; color: Theme.ink; opacity: 0 }
    }
    SequentialAnimation {
        id: crt
        property string what: ""
        ScriptAction { script: Sound.play("win_close") }
        ParallelAnimation {
            NumberAnimation { target: topCurtain; property: "height"; to: crtWin.height / 2 - 1; duration: 260; easing.type: Easing.InQuad }
            NumberAnimation { target: botCurtain; property: "height"; to: crtWin.height / 2 - 1; duration: 260; easing.type: Easing.InQuad }
            NumberAnimation { target: beam; property: "opacity"; to: 1; duration: 200 }
        }
        NumberAnimation { target: beam; property: "width"; to: 4; duration: 160; easing.type: Easing.InQuad }
        NumberAnimation { target: beam; property: "opacity"; to: 0; duration: 120 }
        ScriptAction {
            script: {
                topCurtain.height = 0; botCurtain.height = 0; beam.width = crtWin.width;
                if (crt.what === "sleep") Quickshell.execDetached(["systemctl", "suspend"]);
                else if (crt.what === "reboot") Quickshell.execDetached(["systemctl", "reboot"]);
                else if (crt.what === "poweroff") Quickshell.execDetached(["systemctl", "poweroff"]);
                else if (crt.what === "logout") Hyprland.dispatch(Hyprland.usingLua ? "hl.dsp.exit()" : "exit");
            }
        }
    }
}
