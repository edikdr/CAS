pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import "../theme"
import "../services"
import "../components"

// Боковая панель Haotica (Super+A): портрет и состояние из haotica.json, короткий чат,
// карточки разрешений [TAB]/[ESC]; полное окно — кнопка ОКНО (haotica open assistant).
PanelWindow {
    id: panel
    Component.onCompleted: Ui.reg("haotica", panel)
    visible: Ui.haoticaOpen
    anchors { top: true; bottom: true; right: true }
    implicitWidth: 440
    exclusionMode: ExclusionMode.Ignore
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "haotica-panel"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None

    property var messages: []
    property var cards: []
    property bool busy: false
    readonly property var h: Core.haotica || ({})

    onVisibleChanged: if (visible) { load(); input.forceActiveFocus(); }

    function load() {
        Core.haoticaApi("GET", "/api/history?chat=panel&n=20", null, function(st, d) {
            if (st === 200 && d && d.messages) {
                panel.messages = d.messages.filter(m => m.role === "user" || m.role === "assistant").slice(-12);
                panel.cards = d.cards || [];
            }
        });
    }
    function send(text) {
        text = text.trim();
        if (!text || busy) return;
        busy = true;
        messages = messages.concat([{ role: "user", content: text }]);
        Core.haoticaApi("POST", "/api/chat", { text: text, source: "panel", chat: "panel", wait: true }, function(st, d) {
            panel.busy = false;
            const t = d && d.ok ? d.text : (d && d.error ? d.error : "NEURAL CORE OFFLINE — модель загружается или служба выключена");
            panel.messages = panel.messages.concat([{ role: d && d.ok ? "assistant" : "error", content: t }]);
            panel.load();
        });
    }
    function decide(card, accept) {
        Core.haoticaApi("POST", "/api/card/" + card.id + "/" + (accept ? "accept" : "reject"), {}, function() { panel.load(); });
        panel.cards = panel.cards.filter(c => c.id !== card.id);
    }
    Timer { interval: 1500; running: panel.visible && (panel.busy || panel.cards.length > 0); repeat: true; onTriggered: panel.load() }

    Rectangle {
        anchors.fill: parent
        color: Theme.alpha(Theme.bg0, 0.96)
        border.color: Theme.line
        Rectangle { width: 2; anchors { left: parent.left; top: parent.top; bottom: parent.bottom } color: Theme.violet; opacity: 0.6 }

        Keys.onEscapePressed: Ui.haoticaOpen = false

        ColumnLayout {
            anchors { fill: parent; margins: 16 }
            spacing: 10

            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                Image {
                    id: portrait
                    Layout.preferredWidth: 96; Layout.preferredHeight: 104
                    fillMode: Image.PreserveAspectFit; smooth: true; asynchronous: true
                    source: "file://" + Theme.dataDir + "/avatar/" + (panel.h.state || "idle") + ".png"
                    onStatusChanged: if (status === Image.Error && source.toString().indexOf("/idle.png") < 0) source = "file://" + Theme.dataDir + "/avatar/idle.png"
                    Glyph { visible: portrait.status !== Image.Ready; anchors.centerIn: parent; name: "haotica"; size: 48; color: Theme.violet }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 3
                    Text { text: "HAOTICA"; color: Theme.accent; font.family: Theme.fontMono; font.pixelSize: 15; font.letterSpacing: 4; font.weight: Font.DemiBold }
                    Text { text: (panel.h.state || "offline").toUpperCase() + " · " + String(panel.h.llm_state || "offline").toUpperCase()
                           color: panel.h.llm_state === "ready" ? Theme.teal : Theme.amber; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.5 }
                    Text { text: (panel.h.llm_role || "base").toUpperCase() + " · " + (panel.h.llm_model || "") + (panel.h.llm_tps ? " · " + panel.h.llm_tps + " T/S" : "")
                           color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; elide: Text.ElideRight; Layout.fillWidth: true }
                    Text { visible: panel.h.cloud_assist === true; text: "CLOUD ASSIST ACTIVE"; color: Theme.violet; font.family: Theme.fontMono; font.pixelSize: 10 }
                }
                ColumnLayout {
                    spacing: 6
                    HButton { text: "ОКНО"; onClicked: { Quickshell.execDetached(["haotica", "open", "assistant"]); Ui.haoticaOpen = false; } }
                    HButton { text: "✕"; onClicked: Ui.haoticaOpen = false }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.line }

            ListView {
                id: list
                Layout.fillWidth: true; Layout.fillHeight: true
                clip: true; spacing: 8
                model: panel.messages
                onCountChanged: positionViewAtEnd()
                delegate: Rectangle {
                    id: bubble
                    required property var modelData
                    width: list.width
                    height: txt.implicitHeight + 16
                    color: modelData.role === "user" ? Theme.inkFaint : Theme.bg1
                    border.color: modelData.role === "error" ? Theme.coral : Theme.line
                    Rectangle { visible: bubble.modelData.role === "assistant"; width: 2; height: parent.height; color: Theme.accent }
                    Text {
                        id: txt
                        anchors { fill: parent; margins: 8 }
                        text: (bubble.modelData.role === "user" ? "▸ " : "") + bubble.modelData.content
                        color: bubble.modelData.role === "error" ? Theme.coral : Theme.ink
                        font.family: Theme.fontUi; font.pixelSize: 12; wrapMode: Text.Wrap; textFormat: Text.PlainText
                    }
                }
            }

            Repeater {
                model: panel.cards
                delegate: Rectangle {
                    id: card
                    required property var modelData
                    readonly property bool danger: (modelData.risk || {}).level === "danger"
                    Layout.fillWidth: true
                    implicitHeight: cardCol.implicitHeight + 16
                    color: Theme.bg1
                    border.color: danger ? Theme.coral : Theme.amber
                    ColumnLayout {
                        id: cardCol
                        anchors { fill: parent; margins: 8 }
                        Text { text: "HAOTICA // " + (card.modelData.title || "ДЕЙСТВИЕ") + (card.danger ? " · DANGER" : "")
                               color: card.danger ? Theme.coral : Theme.amber; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 2 }
                        Text { Layout.fillWidth: true; text: card.modelData.command || card.modelData.question || card.modelData.text || ""
                               color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11; wrapMode: Text.WrapAnywhere; maximumLineCount: 6; elide: Text.ElideRight }
                        RowLayout {
                            HButton { text: card.danger ? "ПОНИМАЮ, ПРИНЯТЬ" : "[TAB] ПРИНЯТЬ"; variant: card.danger ? "danger" : "plate"; onClicked: panel.decide(card.modelData, true) }
                            HButton { text: "[ESC] ОТКЛОНИТЬ"; onClicked: panel.decide(card.modelData, false) }
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 40
                color: Theme.bg1
                border.color: input.activeFocus ? Theme.accent : Theme.line
                TextInput {
                    id: input
                    anchors { fill: parent; leftMargin: 10; rightMargin: 10 }
                    verticalAlignment: TextInput.AlignVCenter
                    color: Theme.ink; font.family: Theme.fontUi; font.pixelSize: 13
                    selectByMouse: true; clip: true
                    Text { anchors.verticalCenter: parent.verticalCenter; visible: !input.text && !input.activeFocus
                           text: panel.busy ? "Haotica думает…" : "Спроси Haotica…"; color: Theme.dim; font: input.font }
                    Keys.onReturnPressed: { panel.send(text); text = ""; }
                    Keys.onTabPressed: (e) => { const c = panel.cards[panel.cards.length - 1]; if (c && (c.risk || {}).level !== "danger") panel.decide(c, true); e.accepted = true; }
                    Keys.onEscapePressed: { const c = panel.cards[panel.cards.length - 1]; if (c) panel.decide(c, false); else Ui.haoticaOpen = false; }
                }
            }
        }
    }
}
