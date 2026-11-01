import QtQuick
import "../theme"

// Сегментный ползунок 0..1
Item {
    id: root
    property real value: 0.5
    property color color: Theme.accent
    property int count: 20
    signal moved(real value)
    implicitWidth: 220
    implicitHeight: 16

    SegBar {
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width
        value: root.value
        count: root.count
        segHeight: 10
        fillColor: root.color
    }
    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        function set(mx) {
            root.value = Math.max(0, Math.min(1, mx / width));
            root.moved(root.value);
        }
        onPressed: mouse => set(mouse.x)
        onPositionChanged: mouse => { if (pressed) set(mouse.x); }
        onWheel: wheel => { root.value = Math.max(0, Math.min(1, root.value + (wheel.angleDelta.y > 0 ? 0.05 : -0.05))); root.moved(root.value); }
    }
}
