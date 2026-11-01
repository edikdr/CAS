import QtQuick
import "../theme"

// Переключатель: дорожка заполняется штриховкой //// за ползунком
Item {
    id: root
    property bool checked: false
    property color color: Theme.teal
    signal toggled(bool value)
    implicitWidth: 46
    implicitHeight: 20

    Rectangle {
        id: track
        anchors.fill: parent
        radius: height / 2
        color: "transparent"
        border.color: root.checked ? root.color : Theme.line
        border.width: 1
        clip: true
        Hatch {
            anchors.fill: parent
            color: root.color
            opacity: root.checked ? 1 : 0
            Behavior on opacity { NumberAnimation { duration: Theme.ms(200) } }
        }
    }
    Rectangle {
        width: 12; height: 12; radius: 6
        y: 4
        x: root.checked ? root.width - 16 : 4
        color: root.checked ? Theme.ink : Theme.dim
        Behavior on x { NumberAnimation { duration: Theme.ms(220); easing.type: Easing.OutCubic } }
    }
    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: { root.checked = !root.checked; root.toggled(root.checked); }
    }
}
