pragma ComponentBehavior: Bound
import QtQuick
import "../theme"

// Скобки-уголки фокуса: «защёлкиваются» вокруг элемента при наведении
Item {
    id: root
    property bool active: false
    property color color: Theme.accent
    property int size: 8
    property int offset: active ? -4 : -10
    opacity: active ? 1 : 0
    anchors.fill: parent

    Behavior on offset { NumberAnimation { duration: Theme.ms(120); easing.type: Easing.OutCubic } }
    Behavior on opacity { NumberAnimation { duration: Theme.ms(120) } }

    component Corner: Item {
        property bool isRight: false
        property bool isBottom: false
        width: root.size; height: root.size
        Rectangle { width: parent.width; height: 1; color: root.color; y: parent.isBottom ? parent.height - 1 : 0 }
        Rectangle { width: 1; height: parent.height; color: root.color; x: parent.isRight ? parent.width - 1 : 0 }
    }
    Corner { x: root.offset; y: root.offset }
    Corner { isRight: true; x: root.width - root.size - root.offset; y: root.offset }
    Corner { isBottom: true; x: root.offset; y: root.height - root.size - root.offset }
    Corner { isRight: true; isBottom: true; x: root.width - root.size - root.offset; y: root.height - root.size - root.offset }
}
