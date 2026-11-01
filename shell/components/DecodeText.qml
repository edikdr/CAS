import QtQuick
import "../theme"

// Текст «расшифровывается» из случайных символов (анимация ДЕКОД, скорость 0.5×)
Text {
    id: root
    property string target: ""
    property int baseDuration: 500
    property real progress: 1
    readonly property string glyphs: "▓▒░#%&@$01<>/\\=+*ABCDEFX"
    color: Theme.ink
    font.family: Theme.fontMono

    onTargetChanged: restart()
    Component.onCompleted: text = target

    function restart() {
        if (Theme.reduceMotion) { text = target; return; }
        anim.stop();
        progress = 0;
        anim.duration = Math.round(baseDuration / Math.max(0.1, Theme.decodeSpeed) / Math.max(0.1, Theme.speed));
        anim.start();
    }
    function render() {
        const n = Math.floor(progress * target.length);
        let out = target.slice(0, n);
        for (let i = n; i < target.length; i++) {
            const ch = target[i];
            out += (ch === " " || ch === "\n") ? ch : glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        text = out;
    }
    NumberAnimation on progress { id: anim; running: false; from: 0; to: 1; easing.type: Easing.OutQuad }
    onProgressChanged: render()
}
