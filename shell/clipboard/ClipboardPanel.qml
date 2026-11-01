pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "../theme"
import "../services"
import "../components"

// История буфера обмена (cliphist)
PanelWindow {
    id: cp
    visible: Ui.clipboardOpen
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: Theme.alpha(Theme.bg0, 0.55)
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "hyperina-launcher"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

    property var entries: []
    property string filter: ""
    property int sel: 0
    readonly property var shown: entries.filter(e => filter === "" || e.text.toLowerCase().indexOf(filter.toLowerCase()) >= 0).slice(0, 60)

    onVisibleChanged: if (visible) { filter = ""; sel = 0; q.text = ""; q.forceActiveFocus(); lister.running = true; }

    Process {
        id: lister
        command: ["cliphist", "list"]
        stdout: StdioCollector {
            onStreamFinished: {
                const out = [];
                for (const line of text.split("\n")) {
                    const tab = line.indexOf("\t");
                    if (tab > 0) out.push({ id: line.slice(0, tab), text: line.slice(tab + 1) });
                }
                cp.entries = out;
            }
        }
    }
    function pick(e) {
        Quickshell.execDetached(["sh", "-c", "cliphist decode " + e.id + " | wl-copy"]);
        Ui.clipboardOpen = false;
    }

    MouseArea { anchors.fill: parent; onClicked: Ui.clipboardOpen = false }
    Item {
        width: 640; height: 520
        anchors.centerIn: parent
        MouseArea { anchors.fill: parent }
        HFrame { anchors.fill: parent; fill: Theme.bg1; stroke: Theme.lineHi }
        ColumnLayout {
            anchors.fill: parent; anchors.margins: 16
            spacing: 10
            RowLayout {
                Glyph { name: "clipboard"; size: 18; color: Theme.dim }
                TextInput {
                    id: q
                    Layout.fillWidth: true
                    color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 16
                    onTextChanged: { cp.filter = text; cp.sel = 0; }
                    Keys.onEscapePressed: Ui.clipboardOpen = false
                    Keys.onDownPressed: cp.sel = Math.min(cp.sel + 1, cp.shown.length - 1)
                    Keys.onUpPressed: cp.sel = Math.max(0, cp.sel - 1)
                    Keys.onReturnPressed: if (cp.shown.length > 0) cp.pick(cp.shown[cp.sel])
                    Text { visible: q.text === ""; text: "Поиск по истории буфера…"; color: Theme.dim; font: q.font }
                }
            }
            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.line }
            ListView {
                Layout.fillWidth: true; Layout.fillHeight: true
                clip: true
                model: cp.shown
                currentIndex: cp.sel
                delegate: Item {
                    id: d
                    required property var modelData
                    required property int index
                    width: ListView.view.width; height: 34
                    Rectangle { anchors.fill: parent; color: d.index === cp.sel ? Theme.hover : "transparent" }
                    Text { x: 10; anchors.verticalCenter: parent.verticalCenter; width: parent.width - 20; text: d.modelData.text; color: Theme.ink; elide: Text.ElideRight; font.family: Theme.fontMono; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; hoverEnabled: true; onEntered: cp.sel = d.index; onClicked: cp.pick(d.modelData) }
                }
            }
            Text { text: "▲▼ : ВЫБОР   ⏎ : СКОПИРОВАТЬ   ESC : НАЗАД"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1 }
        }
    }
}
