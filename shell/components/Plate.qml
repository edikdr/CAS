import QtQuick
import QtQuick.Shapes
import "../theme"

// Инверсная плашка: светлый фон, тёмный текст, срезанный правый край
Item {
    id: root
    property string text: ""
    property color fill: Theme.ink
    property color textColor: Theme.bg0
    property int pixelSize: 11
    property int slant: 8
    implicitWidth: label.implicitWidth + 14 + slant
    implicitHeight: label.implicitHeight + 6

    Shape {
        anchors.fill: parent
        ShapePath {
            fillColor: root.fill
            strokeColor: "transparent"
            startX: 0; startY: 0
            PathLine { x: root.width; y: 0 }
            PathLine { x: root.width - root.slant; y: root.height }
            PathLine { x: 0; y: root.height }
            PathLine { x: 0; y: 0 }
        }
    }
    Text {
        id: label
        x: 7
        anchors.verticalCenter: parent.verticalCenter
        text: root.text
        color: root.textColor
        font.family: Theme.fontMono
        font.pixelSize: root.pixelSize
        font.weight: Font.DemiBold
        font.letterSpacing: 1.2
    }
}
