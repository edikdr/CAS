import QtQuick
import "../theme"

// Строка досье: КЛЮЧ ........ значение
Item {
    id: root
    property string key: ""
    property string value: ""
    property color valueColor: Theme.ink
    property int pixelSize: 11
    implicitHeight: keyText.implicitHeight + 2
    implicitWidth: 220

    Text {
        id: keyText
        text: root.key
        color: Theme.dim
        font.family: Theme.fontMono
        font.pixelSize: root.pixelSize
        font.letterSpacing: 1
    }
    Text {
        id: valueText
        anchors.right: parent.right
        text: root.value
        color: root.valueColor
        font.family: Theme.fontMono
        font.pixelSize: root.pixelSize
        font.weight: Font.Medium
        font.features: { "tnum": 1 }
    }
    Canvas {
        x: keyText.width + 6
        width: Math.max(0, valueText.x - keyText.width - 12)
        y: keyText.height - 4
        height: 1
        onWidthChanged: requestPaint()
        onPaint: {
            const ctx = getContext("2d");
            ctx.reset();
            ctx.fillStyle = Theme.alpha(Theme.lineHi, 0.6);
            for (let x = 0; x < width; x += 3) ctx.fillRect(x, 0, 1, 1);
        }
    }
}
