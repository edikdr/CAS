import QtQuick
import "../theme"

// Мини-график с заливкой и выделенной последней точкой
Canvas {
    id: root
    property var values: []
    property real maxValue: 100
    property color color: Theme.teal
    property color endColor: Theme.accent
    property bool grid: true
    onValuesChanged: requestPaint()
    onColorChanged: requestPaint()
    onWidthChanged: requestPaint()
    onPaint: {
        const ctx = getContext("2d");
        ctx.reset();
        const n = values.length;
        if (grid) {
            ctx.strokeStyle = Theme.alpha(Theme.line, 0.55);
            ctx.lineWidth = 1;
            for (let i = 1; i < 3; i++) {
                const y = Math.round(height * i / 3) + 0.5;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
        }
        if (n < 2) return;
        const px = i => i * (width - 3) / (n - 1) + 1;
        const py = v => height - 2 - Math.max(0, Math.min(1, v / maxValue)) * (height - 4);
        ctx.beginPath();
        ctx.moveTo(px(0), height);
        for (let i = 0; i < n; i++) ctx.lineTo(px(i), py(values[i]));
        ctx.lineTo(px(n - 1), height);
        ctx.closePath();
        ctx.fillStyle = Theme.alpha(root.color, 0.14);
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < n; i++) i === 0 ? ctx.moveTo(px(i), py(values[i])) : ctx.lineTo(px(i), py(values[i]));
        ctx.strokeStyle = root.color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = root.endColor;
        ctx.fillRect(px(n - 1) - 2, py(values[n - 1]) - 2, 4, 4);
    }
}
