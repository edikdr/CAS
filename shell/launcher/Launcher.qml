pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets
import "../theme"
import "../services"
import "../components"

// Лаунчер: поиск программ и действий. Префиксы: ? — спросить Haotica, = — посчитать, > — команда в терминале
PanelWindow {
    id: win
    Component.onCompleted: Ui.reg("launcher", win)
    visible: Ui.launcherOpen
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: Theme.alpha(Theme.bg0, 0.55)
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "haotica-launcher"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

    property string query: ""
    property string cat: "all"
    property int sel: 0

    readonly property var cats: [["all", "ВСЕ"], ["ai", "ИИ"], ["chat", "ОБЩЕНИЕ"], ["social", "СОЦСЕТИ"], ["dev", "РАЗРАБОТКА"],
        ["finance", "ФИНАНСЫ"], ["media", "ИГРЫ И МЕДИА"], ["system", "СИСТЕМА"]]
    readonly property var known: ({
        "haotica-web-chatgpt": "ai", "haotica-web-gemini": "ai", "haotica-web-grok": "ai", "haotica-web-claude": "ai",
        "haotica-web-elevenlabs": "ai", "haotica-assistant": "ai", "haotica-cloud": "ai",
        "org.telegram.desktop": "chat", "vesktop": "chat", "discord": "chat", "haotica-web-whatsapp": "chat", "haotica-notes": "chat",
        "haotica-web-reddit": "social", "haotica-web-x": "social", "haotica-web-pinterest": "social", "haotica-store": "social",
        "code": "dev", "obsidian": "dev", "haotica-terminal": "dev", "haotica-editor": "dev", "haotica-web-github": "dev",
        "haotica-web-sparkasse": "finance", "org.keepassxc.KeePassXC": "finance",
        "steam": "media", "spotify": "media", "mpv": "media", "com.obsproject.Studio": "media", "haotica-web-chess": "media",
        "haotica-player": "media", "haotica-gallery": "media"
    })
    function catOf(e) {
        if (known[e.id] !== undefined) return known[e.id];
        const c = (e.categories || "").toString();
        if (c.indexOf("Game") >= 0 || c.indexOf("AudioVideo") >= 0 || c.indexOf("Audio") >= 0 || c.indexOf("Video") >= 0) return "media";
        if (c.indexOf("Development") >= 0 || c.indexOf("Office") >= 0) return "dev";
        if (c.indexOf("InstantMessaging") >= 0 || c.indexOf("Chat") >= 0) return "chat";
        if (c.indexOf("Finance") >= 0) return "finance";
        return "system";
    }

    readonly property string mode: query.startsWith("?") ? "ask" : (query.startsWith("=") ? "calc" : (query.startsWith(">") ? "cmd" : "apps"))
    readonly property var results: {
        if (mode !== "apps") return [];
        const q = query.toLowerCase().trim();
        const all = DesktopEntries.applications.values;
        const out = [];
        for (let i = 0; i < all.length; i++) {
            const e = all[i];
            if (e.noDisplay) continue;
            if (cat !== "all" && catOf(e) !== cat) continue;
            const hay = (e.name + " " + (e.genericName || "") + " " + (e.keywords || "") + " " + e.id).toLowerCase();
            if (q === "" || hay.indexOf(q) >= 0) out.push({ e: e, score: e.name.toLowerCase().startsWith(q) ? 0 : 1 });
        }
        out.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name));
        return out.slice(0, 40).map(x => x.e);
    }
    readonly property string calcResult: {
        if (mode !== "calc") return "";
        const expr = query.slice(1).replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**");
        if (!/^[0-9+\-*/().%\s*]+$/.test(expr) || expr.trim() === "") return "";
        try { const v = Function("return (" + expr + ")")(); return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1e10) / 1e10) : ""; }
        catch (e) { return ""; }
    }

    function open() { query = ""; sel = 0; cat = "all"; Ui.launcherOpen = true; input.forceActiveFocus(); Sound.play("access"); }
    function close() { Ui.launcherOpen = false; }
    function activate() {
        if (mode === "ask") {
            const q = query.slice(1).trim();
            if (q !== "") { Core.haoticaApi("POST", "/api/ask", { text: q, source: "launcher" }, null); Quickshell.execDetached(["haotica", "open", "assistant"]); }
        } else if (mode === "calc") {
            if (calcResult !== "") Quickshell.execDetached(["wl-copy", calcResult]);
        } else if (mode === "cmd") {
            Quickshell.execDetached(["haotica", "open", "terminal", "--run", query.slice(1).trim()]);
        } else if (results.length > 0) {
            results[Math.min(sel, results.length - 1)].execute();
            Sound.play("win_open");
        }
        close();
    }

    onVisibleChanged: if (visible) { input.text = ""; input.forceActiveFocus(); intro.restart(); }

    MouseArea { anchors.fill: parent; onClicked: win.close() }

    Item {
        id: panel
        width: Math.min(760, parent.width - 80)
        height: 560
        anchors.centerIn: parent
        MouseArea { anchors.fill: parent }

        // открытие — ЧЕРТЁЖ: рамка прочерчивается, затем проявляется содержимое
        HFrame { id: frame; anchors.fill: parent; fill: Theme.alpha(Theme.bg1, 0.97); stroke: Theme.lineHi }
        ParallelAnimation {
            id: intro
            NumberAnimation { target: frame; property: "opacity"; from: 0; to: 1; duration: Theme.ms(180) }
            NumberAnimation { target: body; property: "opacity"; from: 0; to: 1; duration: Theme.ms(260) }
            NumberAnimation { target: body; property: "y"; from: 8; to: 0; duration: Theme.ms(260); easing.type: Easing.OutCubic }
        }

        Item {
            id: body
            anchors.fill: parent
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 18
                spacing: 12

                RowLayout {
                    spacing: 10
                    Glyph { name: win.mode === "ask" ? "haotica" : "search"; size: 20; color: win.mode === "ask" ? Theme.violet : Theme.dim }
                    TextInput {
                        id: input
                        Layout.fillWidth: true
                        color: Theme.ink
                        font.family: Theme.fontMono
                        font.pixelSize: 20
                        selectionColor: Theme.selection
                        onTextChanged: { win.query = text; win.sel = 0; }
                        Keys.onEscapePressed: win.close()
                        Keys.onReturnPressed: win.activate()
                        Keys.onDownPressed: win.sel = Math.min(win.sel + 1, Math.max(0, win.results.length - 1))
                        Keys.onUpPressed: win.sel = Math.max(0, win.sel - 1)
                        Keys.onTabPressed: {
                            const i = win.cats.findIndex(c => c[0] === win.cat);
                            win.cat = win.cats[(i + 1) % win.cats.length][0];
                        }
                        Text {
                            visible: input.text === ""
                            text: "Поиск… · ? спросить Haotica · = посчитать · > команда"
                            color: Theme.dim
                            font: input.font
                        }
                    }
                    Plate { text: win.mode === "apps" ? "APPS" : win.mode.toUpperCase(); fill: win.mode === "ask" ? Theme.violet : Theme.ink }
                }
                Rectangle { Layout.fillWidth: true; height: 1; color: Theme.line }

                Row {
                    visible: win.mode === "apps"
                    spacing: 6
                    Repeater {
                        model: win.cats
                        Item {
                            id: chipItem
                            required property var modelData
                            readonly property bool on: win.cat === modelData[0]
                            implicitWidth: chipText.implicitWidth + 18
                            implicitHeight: 22
                            Rectangle {
                                anchors.fill: parent
                                radius: height / 2
                                color: chipItem.on ? Theme.ink : "transparent"
                                border.color: chipItem.on ? Theme.ink : Theme.line
                            }
                            Rectangle {
                                visible: chipItem.modelData[0] !== "all"
                                width: 6; height: 2
                                color: Theme.category(chipItem.modelData[0])
                                anchors { left: parent.left; leftMargin: 8; bottom: parent.bottom; bottomMargin: 3 }
                            }
                            Text {
                                id: chipText
                                anchors.centerIn: parent
                                text: chipItem.modelData[1]
                                color: chipItem.on ? Theme.bg0 : Theme.dim
                                font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1
                            }
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.cat = chipItem.modelData[0] }
                        }
                    }
                }

                // результаты
                ListView {
                    id: list
                    visible: win.mode === "apps"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    model: win.results
                    currentIndex: win.sel
                    spacing: 2
                    highlightMoveDuration: Theme.ms(90)
                    delegate: Item {
                        id: row
                        required property var modelData
                        required property int index
                        width: list.width
                        height: 44
                        readonly property bool cur: index === win.sel
                        Rectangle { anchors.fill: parent; color: row.cur ? Theme.hover : "transparent" }
                        Rectangle { visible: row.cur; width: 2; height: parent.height; color: Theme.accent }
                        IconImage {
                            x: 12; anchors.verticalCenter: parent.verticalCenter
                            implicitSize: 30
                            source: Quickshell.iconPath(row.modelData.icon, "application-x-executable")
                        }
                        Column {
                            x: 54; anchors.verticalCenter: parent.verticalCenter
                            Text { text: row.modelData.name; color: Theme.ink; font.family: Theme.fontUi; font.pixelSize: 14 }
                            Text { text: row.modelData.comment || row.modelData.genericName || ""; color: Theme.dim; font.family: Theme.fontUi; font.pixelSize: 11; width: list.width - 140; elide: Text.ElideRight }
                        }
                        Rectangle {
                            anchors { right: parent.right; rightMargin: 14; verticalCenter: parent.verticalCenter }
                            width: 14; height: 2
                            color: Theme.category(win.catOf(row.modelData))
                        }
                        MouseArea {
                            anchors.fill: parent
                            hoverEnabled: true
                            onEntered: win.sel = row.index
                            onClicked: { win.sel = row.index; win.activate(); }
                        }
                    }
                }

                // режимы: Haotica, калькулятор, команда
                Column {
                    visible: win.mode !== "apps"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 10
                    Text {
                        text: win.mode === "ask" ? "Спросить Haotica" : (win.mode === "calc" ? "Результат" : "Выполнить в терминале")
                        color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.2
                    }
                    Text {
                        text: win.mode === "calc" ? (win.calcResult !== "" ? "= " + win.calcResult : "…") : win.query.slice(1)
                        color: win.mode === "ask" ? Theme.violet : Theme.ink
                        font.family: win.mode === "calc" ? Theme.fontDot : Theme.fontMono
                        font.pixelSize: win.mode === "calc" ? 56 : 18
                        wrapMode: Text.Wrap
                        width: parent.width
                    }
                    Text {
                        visible: win.mode === "calc"
                        text: "⏎ — скопировать результат"
                        color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11
                    }
                }

                Rectangle { Layout.fillWidth: true; height: 1; color: Theme.line }
                RowLayout {
                    Text { text: "▲▼ : ВЫБОР   ⏎ : ОТКРЫТЬ   TAB : КАТЕГОРИЯ   ESC : НАЗАД"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1 }
                    Item { Layout.fillWidth: true }
                    Hatch { implicitWidth: 80; implicitHeight: 7 }
                }
            }
        }
    }
}
