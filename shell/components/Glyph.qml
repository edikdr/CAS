import QtQuick
import QtQuick.Shapes
import "../theme"
import "Glyphs.js" as Glyphs

// Линейная пиктограмма HAOTICA (сетка 24×24)
Item {
    id: root
    property string name: "sparkle"
    property color color: Theme.ink
    property real size: 18
    property real lineWidth: 1.5
    implicitWidth: size
    implicitHeight: size

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: root.color
            strokeWidth: root.lineWidth
            fillColor: "transparent"
            capStyle: ShapePath.SquareCap
            joinStyle: ShapePath.MiterJoin
            scale: Qt.size(root.size / 24, root.size / 24)
            PathSvg { path: Glyphs.get(root.name) }
        }
    }
}
