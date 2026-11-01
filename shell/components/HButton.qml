import QtQuick
import "../theme"

// Кнопка HYPERINA: «plate» — инверсная плашка, «ghost» — контур; скобки при наведении
Item {
    id: root
    property string text: ""
    property string glyph: ""
    property string variant: "ghost"   // ghost, plate, danger
    property bool checked: false
    signal clicked()

    implicitWidth: Math.max(36, row.implicitWidth + 24)
    implicitHeight: 30
    activeFocusOnTab: true

    readonly property bool hot: mouse.containsMouse || activeFocus
    readonly property color fg: variant === "plate" ? Theme.bg0 : (variant === "danger" ? Theme.coral : (checked ? Theme.accent : Theme.ink))

    HFrame {
        anchors.fill: parent
        cut: 6
        cutTL: false
        nodes: false
        fill: root.variant === "plate" ? (mouse.pressed ? Theme.accent : Theme.ink)
              : (mouse.pressed ? Theme.alpha(Theme.accent, 0.25) : (root.hot ? Theme.hover : "transparent"))
        stroke: root.variant === "plate" ? "transparent" : (root.checked ? Theme.accent : (root.variant === "danger" ? Theme.coral : Theme.line))
    }
    Row {
        id: row
        anchors.centerIn: parent
        spacing: 8
        Glyph { visible: root.glyph !== ""; name: root.glyph; color: root.fg; size: 16; anchors.verticalCenter: parent.verticalCenter }
        Text {
            visible: root.text !== ""
            text: root.text
            color: root.fg
            font.family: Theme.fontMono
            font.pixelSize: 11
            font.weight: Font.Medium
            font.letterSpacing: 1.2
            font.capitalization: Font.AllUppercase
            anchors.verticalCenter: parent.verticalCenter
        }
    }
    Brackets { active: root.hot && root.variant !== "plate" }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }
    Keys.onReturnPressed: root.clicked()
    Keys.onSpacePressed: root.clicked()
}
