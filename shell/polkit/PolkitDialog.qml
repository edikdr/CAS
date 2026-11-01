import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.Polkit
import "../theme"
import "../services"
import "../components"

// Запрос прав администратора (polkit) в стиле досье: AUTH REQUEST
Scope {
    PolkitAgent { id: agent }

    PanelWindow {
        visible: agent.isActive && agent.flow !== null
        anchors { top: true; bottom: true; left: true; right: true }
        exclusionMode: ExclusionMode.Ignore
        color: Theme.alpha(Theme.bg0, 0.7)
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.namespace: "haotica-power"
        WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
        onVisibleChanged: if (visible) { pw.text = ""; pw.forceActiveFocus(); Sound.play("notify"); }

        Item {
            width: 520; height: col.implicitHeight + 40
            anchors.centerIn: parent
            HFrame { anchors.fill: parent; fill: Theme.bg1; stroke: Theme.amber; nodeColor: Theme.amber }
            ColumnLayout {
                id: col
                x: 20; y: 20; width: parent.width - 40
                spacing: 12
                RowLayout {
                    Text { text: "AUTH REQUEST // ПРАВА АДМИНИСТРАТОРА"; color: Theme.amber; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.4; Layout.fillWidth: true }
                    Glyph { name: "shield"; size: 18; color: Theme.amber }
                }
                Text {
                    Layout.fillWidth: true
                    text: agent.flow ? agent.flow.message : ""
                    color: Theme.ink; font.family: Theme.fontUi; font.pixelSize: 14
                    wrapMode: Text.Wrap
                }
                Text {
                    Layout.fillWidth: true
                    visible: agent.flow && agent.flow.supplementaryMessage !== ""
                    text: agent.flow ? agent.flow.supplementaryMessage : ""
                    color: agent.flow && agent.flow.supplementaryIsError ? Theme.coral : Theme.dim
                    font.family: Theme.fontMono; font.pixelSize: 11
                    wrapMode: Text.Wrap
                }
                Text { text: agent.flow ? agent.flow.actionId : ""; color: Theme.lineHi; font.family: Theme.fontMono; font.pixelSize: 10 }
                Item {
                    Layout.fillWidth: true; Layout.preferredHeight: 40
                    HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: pw.activeFocus ? Theme.amber : Theme.line; nodes: false }
                    TextInput {
                        id: pw
                        anchors.fill: parent; anchors.margins: 11
                        echoMode: agent.flow && agent.flow.responseVisible ? TextInput.Normal : TextInput.Password
                        passwordCharacter: "■"
                        color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 15
                        onAccepted: if (agent.flow) agent.flow.submit(text)
                        Keys.onEscapePressed: if (agent.flow) agent.flow.cancelAuthenticationRequest()
                        Text { visible: pw.text === ""; text: agent.flow ? (agent.flow.inputPrompt || "Пароль") : ""; color: Theme.dim; font: pw.font }
                    }
                }
                RowLayout {
                    Item { Layout.fillWidth: true }
                    HButton { text: "Отмена"; onClicked: if (agent.flow) agent.flow.cancelAuthenticationRequest() }
                    HButton { text: "Разрешить"; variant: "plate"; onClicked: if (agent.flow) agent.flow.submit(pw.text) }
                }
            }
        }
    }
}
