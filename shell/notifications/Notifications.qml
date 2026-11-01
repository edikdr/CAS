pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.Notifications
import Quickshell.Widgets
import "../theme"
import "../services"
import "../components"

// Уведомления: карточки-досье справа сверху, центр уведомлений по клику на часы
Scope {
    id: root
    property var popups: []

    NotificationServer {
        id: server
        keepOnReload: true
        actionsSupported: true
        bodyMarkupSupported: true
        imageSupported: true
        persistenceSupported: true
        onNotification: n => {
            n.tracked = true;
            if (Ui.dnd && n.urgency !== NotificationUrgency.Critical) return;
            root.popups = [n].concat(root.popups).slice(0, 4);
            Sound.play(n.urgency === NotificationUrgency.Critical ? "error" : "notify");
        }
    }

    function dropPopup(n) { root.popups = root.popups.filter(x => x !== n); }
    function isHaotica(n) { return (n.appName || "").toLowerCase().indexOf("haotica") >= 0; }
    function accentFor(n) {
        if (n.urgency === NotificationUrgency.Critical) return Theme.coral;
        if (isHaotica(n)) return Theme.violet;
        return Theme.teal;
    }

    component Card: Item {
        id: card
        required property var notif
        property bool popup: true
        width: 380
        height: col.implicitHeight + 24
        readonly property color acc: root.accentFor(notif)

        HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg1, 0.97); stroke: Theme.line }
        Rectangle { width: 2; height: parent.height - 16; y: 8; color: card.acc }
        Plate {
            x: parent.width - width - 14; y: -height + 2
            text: root.isHaotica(card.notif) ? "HAOTICA" : (card.notif.appName || "SYSTEM").toUpperCase()
            fill: card.acc
            pixelSize: 9
        }
        ColumnLayout {
            id: col
            x: 16; y: 12
            width: parent.width - 32
            spacing: 6
            RowLayout {
                spacing: 8
                IconImage {
                    visible: (card.notif.appIcon || "") !== ""
                    implicitSize: 18
                    source: Quickshell.iconPath(card.notif.appIcon, true)
                }
                Text {
                    Layout.fillWidth: true
                    text: card.notif.summary
                    color: Theme.ink
                    font.family: Theme.fontUi; font.pixelSize: 13; font.weight: Font.DemiBold
                    elide: Text.ElideRight
                }
                Text { text: "×"; color: Theme.dim; font.pixelSize: 16
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { if (card.popup) root.dropPopup(card.notif); else card.notif.dismiss(); } }
                }
            }
            DecodeText {
                Layout.fillWidth: true
                visible: (card.notif.body || "") !== ""
                target: card.notif.body.replace(/<[^>]*>/g, "")
                color: Theme.dim
                font.family: Theme.fontUi
                font.pixelSize: 12
                wrapMode: Text.Wrap
                maximumLineCount: 5
                elide: Text.ElideRight
                baseDuration: card.popup ? 500 : 0
            }
            Row {
                visible: card.notif.actions.length > 0
                spacing: 6
                Repeater {
                    model: card.notif.actions
                    HButton {
                        required property var modelData
                        text: modelData.text
                        onClicked: { modelData.invoke(); root.dropPopup(card.notif); }
                    }
                }
            }
        }
        Timer {
            running: card.popup && card.notif.urgency !== NotificationUrgency.Critical
            interval: card.notif.expireTimeout > 0 ? card.notif.expireTimeout : 6500
            onTriggered: root.dropPopup(card.notif)
        }
        MouseArea {
            anchors.fill: parent
            z: -1
            onClicked: {
                const acts = card.notif.actions;
                for (let i = 0; i < acts.length; i++) if (acts[i].identifier === "default") { acts[i].invoke(); break; }
                if (card.popup) root.dropPopup(card.notif);
            }
        }
    }

    // всплывающие карточки
    PanelWindow {
        visible: root.popups.length > 0 && !Ui.notificationsOpen
        anchors { top: true; right: true }
        margins { top: 44; right: 16 }
        implicitWidth: 400
        implicitHeight: popCol.implicitHeight + 12
        exclusionMode: ExclusionMode.Ignore
        color: "transparent"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.namespace: "hyperina-notifications"
        Column {
            id: popCol
            y: 12
            spacing: 18
            Repeater {
                model: root.popups
                Card {
                    required property var modelData
                    notif: modelData
                    popup: true
                    x: 10
                    NumberAnimation on x { from: 420; to: 10; duration: Theme.ms(240); easing.type: Easing.OutCubic }
                }
            }
        }
    }

    // центр уведомлений
    PanelWindow {
        visible: Ui.notificationsOpen
        anchors { top: true; right: true; bottom: true }
        margins { top: 40; right: 10; bottom: 84 }
        implicitWidth: 410
        exclusionMode: ExclusionMode.Ignore
        color: "transparent"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.namespace: "hyperina-notifications"
        WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None

        HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg0, 0.95); stroke: Theme.lineHi }
        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 14
            spacing: 10
            RowLayout {
                Text { text: "NOTIFICATIONS // ЦЕНТР"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.6; Layout.fillWidth: true }
                Text { text: "НЕ БЕСПОКОИТЬ"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10 }
                HToggle { checked: Ui.dnd; onToggled: v => Ui.dnd = v }
            }
            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.line }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 16
                topMargin: 10
                model: server.trackedNotifications
                delegate: Card {
                    required property var modelData
                    notif: modelData
                    popup: false
                }
            }
            RowLayout {
                Text { text: server.trackedNotifications.values.length + " ЗАПИСЕЙ"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; Layout.fillWidth: true }
                HButton { text: "Очистить"; onClicked: { const v = server.trackedNotifications.values.slice(); for (const n of v) n.dismiss(); } }
                HButton { text: "Закрыть"; onClicked: Ui.notificationsOpen = false }
            }
        }
    }
}
