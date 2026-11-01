pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets
import "../theme"
import "../services"
import "../components"

// Док: квадратные плитки, цветная метка категории, точка — приложение запущено
PanelWindow {
    id: dock
    required property var modelData
    screen: modelData
    anchors.bottom: true
    margins.bottom: 10
    implicitWidth: row.implicitWidth + 24
    implicitHeight: 64
    exclusiveZone: 74
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "hyperina-dock"

    readonly property var defaults: ["hyperina-terminal", "hyperina-files", "google-chrome", "org.telegram.desktop",
        "vesktop", "steam", "spotify", "code", "obsidian", "hyperina-haotica", "hyperina-settings"]
    readonly property var pinned: (Theme.s.desktop && Theme.s.desktop.dock) ? Theme.s.desktop.dock : defaults

    function entryFor(id) { return DesktopEntries.byId(id) || DesktopEntries.heuristicLookup(id); }
    function runningFor(entry) {
        if (!entry) return null;
        const tl = ToplevelManager.toplevels.values;
        const want = (entry.startupClass || entry.id || "").toLowerCase();
        for (let i = 0; i < tl.length; i++) {
            const a = (tl[i].appId || "").toLowerCase();
            if (a === want || a === (entry.id || "").toLowerCase()) return tl[i];
        }
        return null;
    }

    HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg0, 0.86) }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: 8
        Repeater {
            model: dock.pinned
            Item {
                id: tile
                required property string modelData
                readonly property var entry: dock.entryFor(modelData)
                readonly property var running: dock.runningFor(entry)
                visible: entry !== null
                width: visible ? 46 : 0
                height: 46

                IconImage {
                    anchors.centerIn: parent
                    implicitSize: mouse.containsMouse ? 44 : 40
                    source: tile.entry ? Quickshell.iconPath(tile.entry.icon, "application-x-executable") : ""
                    Behavior on implicitSize { NumberAnimation { duration: Theme.ms(120) } }
                }
                Rectangle {
                    visible: tile.running !== null
                    anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: -5 }
                    width: tile.running && tile.running.activated ? 16 : 5
                    height: 2
                    color: Theme.accent
                    Behavior on width { NumberAnimation { duration: Theme.ms(160) } }
                }
                Brackets { active: mouse.containsMouse; size: 6 }
                MouseArea {
                    id: mouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        if (tile.running) tile.running.activate();
                        else if (tile.entry) { tile.entry.execute(); Sound.play("win_open"); }
                    }
                }
            }
        }
    }
}
