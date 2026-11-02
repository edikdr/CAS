pragma Singleton
import QtQuick
import Quickshell

// Общее состояние оверлеев оболочки (что сейчас открыто)
Singleton {
    property bool launcherOpen: false
    property bool dashboardOpen: false
    property bool notificationsOpen: false
    property bool controlOpen: false
    property bool clipboardOpen: false
    property bool powerOpen: false
    property bool haoticaOpen: false
    property bool dnd: false
    property string osdKind: ""
    property real osdValue: 0
    property bool osdMuted: false
    property int osdSerial: 0

    // журнал HUD (последние строки) и события для живых виджетов
    property var logLines: []
    signal hudPing()
    signal hudGlitch()
    function pushLog(text) {
        const a = logLines.slice(Math.max(0, logLines.length - 6));
        const now = new Date();
        a.push({ t: Qt.formatTime(now, "HH:mm:ss"), text: text });
        logLines = a;
    }

    // отладка: окна регистрируются, чтобы «qs ipc call haotica snapshot <папка>» снимал их без композитора
    property var windows: []
    function reg(name, win) { const a = windows.slice(); a.push({ name: name, win: win }); windows = a; }

    function closeAll() {
        launcherOpen = false; dashboardOpen = false; notificationsOpen = false;
        controlOpen = false; clipboardOpen = false; powerOpen = false; haoticaOpen = false;
    }
    function showOsd(kind, value, muted) {
        osdKind = kind; osdValue = value; osdMuted = muted === true; osdSerial++;
    }
}
