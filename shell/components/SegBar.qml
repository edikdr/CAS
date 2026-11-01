pragma ComponentBehavior: Bound
import QtQuick
import "../theme"

// Сегментная полоса: value 0..1
Row {
    id: root
    property real value: 0
    property int count: 12
    property color fillColor: Theme.accent
    property color emptyColor: Theme.line
    property int segHeight: 6
    spacing: 2
    readonly property int filled: Math.round(Math.max(0, Math.min(1, value)) * count)

    Repeater {
        model: root.count
        Rectangle {
            required property int index
            width: Math.max(2, (root.width - (root.count - 1) * root.spacing) / root.count)
            height: root.segHeight
            color: index < root.filled ? root.fillColor : "transparent"
            border.width: 1
            border.color: index < root.filled ? root.fillColor : root.emptyColor
            Behavior on color { ColorAnimation { duration: Theme.ms(140) } }
        }
    }
}
