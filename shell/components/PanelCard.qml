import QtQuick
import QtQuick.Layouts
import "../theme"

// Карточка-панель: рамка, заголовок с ярлыком, содержимое
Item {
    id: root
    property string title: ""
    property string tag: ""
    property color tagColor: Theme.dim
    property int padding: 14
    default property alias content: body.data
    implicitWidth: 320
    implicitHeight: header.height + body.childrenRect.height + padding * 2 + 8

    HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg1, 0.92) }

    RowLayout {
        id: header
        x: root.padding; y: 10
        width: root.width - root.padding * 2
        height: 18
        Text {
            text: root.title
            color: Theme.ink
            font.family: Theme.fontMono
            font.pixelSize: 11
            font.weight: Font.DemiBold
            font.letterSpacing: 1.6
            font.capitalization: Font.AllUppercase
            Layout.fillWidth: true
        }
        Plate { visible: root.tag !== ""; text: root.tag; fill: root.tagColor; pixelSize: 9 }
    }
    Rectangle { x: 0; y: header.y + header.height + 6; width: root.width; height: 1; color: Theme.line }
    Item {
        id: body
        x: root.padding
        y: header.y + header.height + 14
        width: root.width - root.padding * 2
        height: childrenRect.height
    }
}
