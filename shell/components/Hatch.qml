import QtQuick
import "../theme"

// Штриховка //// — край рамки или состояние «загрузка»
Canvas {
    id: root
    property color color: Theme.line
    property int step: 5
    property real phase: 0
    implicitWidth: 72
    implicitHeight: 7
    onColorChanged: requestPaint()
    onPhaseChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d");
        ctx.reset();
        ctx.strokeStyle = root.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = -height + (phase % step); x < width + height; x += step) {
            ctx.moveTo(x, height);
            ctx.lineTo(x + height, 0);
        }
        ctx.stroke();
    }
}
