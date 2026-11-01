import QtQuick
import QtQuick.Shapes
import "../theme"

// Рамка HYPERINA: тонкая линия, скосы углов, узлы-квадратики на прямых углах
Item {
    id: root
    property color fill: Theme.bg1
    property color stroke: Theme.line
    property real strokeWidth: 1
    property int cut: Theme.chamfer
    property bool cutTL: true
    property bool cutTR: false
    property bool cutBR: true
    property bool cutBL: false
    property bool nodes: true
    property color nodeColor: Theme.ink

    readonly property real h: 0.5

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            fillColor: root.fill
            strokeColor: root.stroke
            strokeWidth: root.strokeWidth
            joinStyle: ShapePath.MiterJoin
            startX: root.cutTL ? root.cut : root.h
            startY: root.h
            PathLine { x: root.width - (root.cutTR ? root.cut : root.h); y: root.h }
            PathLine { x: root.width - root.h; y: root.cutTR ? root.cut : root.h }
            PathLine { x: root.width - root.h; y: root.height - (root.cutBR ? root.cut : root.h) }
            PathLine { x: root.width - (root.cutBR ? root.cut : root.h); y: root.height - root.h }
            PathLine { x: root.cutBL ? root.cut : root.h; y: root.height - root.h }
            PathLine { x: root.h; y: root.height - (root.cutBL ? root.cut : root.h) }
            PathLine { x: root.h; y: root.cutTL ? root.cut : root.h }
            PathLine { x: root.cutTL ? root.cut : root.h; y: root.h }
        }
    }
    Rectangle { visible: root.nodes && !root.cutTR; width: 4; height: 4; color: root.nodeColor; x: root.width - 2; y: -2 }
    Rectangle { visible: root.nodes && !root.cutBL; width: 4; height: 4; color: root.nodeColor; x: -2; y: root.height - 2 }
}
