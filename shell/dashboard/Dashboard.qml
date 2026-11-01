pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import "../theme"
import "../services"
import "../components"

// Дашборд в духе Hyperion: постерный заголовок SYSTEM и плотный HUD. Открытие — СБОРКА
PanelWindow {
    id: dash
    Component.onCompleted: Ui.reg("dashboard", dash)
    visible: Ui.dashboardOpen
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: Theme.alpha(Theme.bg0, 0.985)
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "haotica-dashboard"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

    SystemClock { id: clock; precision: SystemClock.Seconds }
    readonly property var pieces: [c1, c2, c3, c4, c5, c6, c7, c8, title]

    onVisibleChanged: if (visible) { keys.forceActiveFocus(); assemble(); }

    // СБОРКА: карточки прилетают из случайных мест и встают на свои места
    function assemble() {
        for (const c of dash.pieces) {
            c.tx = (Math.random() - 0.5) * 900;
            c.ty = (Math.random() - 0.5) * 500;
            c.rot = (Math.random() - 0.5) * 50;
            c.opacity = 0;
        }
        assembleAnim.restart();
    }
    ParallelAnimation {
        id: assembleAnim
        property int d: Theme.ms(450)
        NumberAnimation { targets: dash.pieces; property: "tx"; to: 0; duration: assembleAnim.d; easing.type: Easing.OutExpo }
        NumberAnimation { targets: dash.pieces; property: "ty"; to: 0; duration: assembleAnim.d; easing.type: Easing.OutExpo }
        NumberAnimation { targets: dash.pieces; property: "rot"; to: 0; duration: assembleAnim.d; easing.type: Easing.OutExpo }
        NumberAnimation { targets: dash.pieces; property: "opacity"; to: 1; duration: assembleAnim.d * 0.6 }
    }

    component Piece: PanelCard {
        id: piece
        property real tx: 0
        property real ty: 0
        property real rot: 0
        transform: [Translate { x: piece.tx; y: piece.ty }, Rotation { angle: piece.rot; origin.x: piece.width / 2; origin.y: piece.height / 2 }]
    }

    Item {
        id: keys
        anchors.fill: parent
        focus: true
        Keys.onEscapePressed: Ui.dashboardOpen = false
        MouseArea { anchors.fill: parent; onClicked: Ui.dashboardOpen = false }
    }

    Item {
        id: title
        property real tx: 0
        property real ty: 0
        property real rot: 0
        transform: [Translate { x: title.tx; y: title.ty }, Rotation { angle: title.rot }]
        x: 56; y: 48
        width: 900; height: 150
        Text { id: big; text: "SYSTEM"; color: Theme.ink; font.family: Theme.fontDisplay; font.pixelSize: 112; font.weight: Font.Black }
        Text {
            anchors { left: big.left; top: big.bottom; topMargin: -10 }
            text: "HAOTICA // " + Qt.formatDateTime(clock.date, "dd.MM.yyyy  HH:mm:ss") + "  //  UPTIME " + Core.uptimeDays + "D"
            color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 13; font.letterSpacing: 1.4
        }
    }

    // данные по требованию (пока дашборд открыт): процессы, погода, календарь, загрузки
    property var procs: []
    property var weather: ({})
    property var agenda: []
    property var models: ({})
    property int updatesCount: 0
    function refresh() {
        Core.api("GET", "/api/sys/procs?sort=cpu", null, function(st, d) { if (st === 200 && d.procs) dash.procs = d.procs.slice(0, 6); });
        Core.api("GET", "/api/weather", null, function(st, d) { if (st === 200 && d.weather) dash.weather = d.weather; });
        const now = new Date(), to = new Date(now.getTime() + 6 * 86400000);
        const iso = function(t) { return Qt.formatDateTime(t, "yyyy-MM-ddTHH:mm"); };
        Core.api("GET", "/api/calendar?from=" + iso(now) + "&to=" + iso(to), null, function(st, d) { if (st === 200 && d.events) dash.agenda = d.events.slice(0, 6); });
        Core.api("GET", "/api/models", null, function(st, d) { if (st === 200 && d.models) dash.models = d.models; });
        Core.api("GET", "/api/updates", null, function(st, d) { if (st === 200) dash.updatesCount = d.count || 0; });
    }
    Timer { interval: 5000; repeat: true; running: dash.visible; triggeredOnStart: true; onTriggered: dash.refresh() }
    readonly property real modelsFrac: {
        let need = 0, have = 0;
        for (const k in dash.models) { need += dash.models[k].size || 0; have += Math.min(dash.models[k].have || 0, dash.models[k].size || 0); }
        return need > 0 ? have / need : 1;
    }
    readonly property var wd: (dash.weather.daily || {})
    readonly property var wc: (dash.weather.current || {})

    // правый верх: блок «загрузка» как в Hyperion
    Item {
        anchors { right: parent.right; top: parent.top; rightMargin: 56; topMargin: 56 }
        width: 470; height: 110
        Rectangle { id: dlbox; width: 96; height: 96; color: Theme.alpha(Theme.accent, 0.06); border.color: Theme.alpha(Theme.accent, 0.7); border.width: 1
            Glyph { anchors.centerIn: parent; name: "download"; size: 40; color: Theme.accent }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Quickshell.execDetached(["haotica", "open", "updates"]) } }
        Column {
            anchors { left: dlbox.right; leftMargin: 16; verticalCenter: dlbox.verticalCenter }
            spacing: 5
            Text { text: dash.modelsFrac >= 1 ? "NEURAL CORE: READY" : "MODELS: " + "▓".repeat(Math.round(dash.modelsFrac * 10)) + "░".repeat(10 - Math.round(dash.modelsFrac * 10)) + "  " + Math.floor(dash.modelsFrac * 100) + "%"
                   color: dash.modelsFrac >= 1 ? Theme.green : Theme.accent; font.family: Theme.fontMono; font.pixelSize: 12; font.letterSpacing: 1.2 }
            Text { text: "UPDATES: " + (dash.updatesCount > 0 ? dash.updatesCount + " AVAILABLE" : "UP TO DATE"); color: dash.updatesCount > 0 ? Theme.amber : Theme.dim; font.family: Theme.fontMono; font.pixelSize: 12; font.letterSpacing: 1.2 }
            Text { text: "CONNECTION: " + (Core.netName !== "" ? "ESTABLISHED" : "—"); color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 12; font.letterSpacing: 1.2 }
            Text { text: "SERVICE PROTOCOL: ACTIVE"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 12; font.letterSpacing: 1.2 }
        }
    }

    GridLayout {
        anchors { left: parent.left; right: parent.right; top: title.bottom; bottom: parent.bottom; margins: 56; topMargin: 26 }
        columns: 4
        rowSpacing: 18; columnSpacing: 18

        Piece {
            id: c1
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "CPU // RYZEN AI MAX+ 392"; tag: Math.round(Core.cpu) + "%"
            Column {
                width: parent.width; spacing: 8
                Sparkline { width: parent.width; height: 76; values: Core.cpuHistory; color: Theme.teal }
                DossierRow { width: parent.width; key: "ТЕМПЕРАТУРА"; value: Math.round(Core.tempCpu) + "°C"; valueColor: Core.tempCpu > 85 ? Theme.coral : Theme.ink }
                DossierRow { width: parent.width; key: "ВЕНТИЛЯТОР"; value: Core.fan > 0 ? Core.fan + " RPM" : "—" }
                DossierRow { width: parent.width; key: "РЕЖИМ"; value: Core.gameMode ? "ИГРА" : Core.powerProfile.toUpperCase() }
                Text { text: "TOP PROCESSES"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 2; topPadding: 6 }
                Repeater {
                    model: dash.procs
                    Row {
                        id: prow
                        required property var modelData
                        width: parent.width; spacing: 8
                        Text { width: parent.width - 110; text: prow.modelData.name; color: Theme.ink; elide: Text.ElideRight; font.family: Theme.fontMono; font.pixelSize: 11 }
                        Text { width: 44; horizontalAlignment: Text.AlignRight; text: prow.modelData.cpu.toFixed(0) + "%"; color: Theme.teal; font.family: Theme.fontMono; font.pixelSize: 11 }
                        Text { width: 50; horizontalAlignment: Text.AlignRight; text: Math.round(prow.modelData.mem_mb) + "M"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11 }
                    }
                }
            }
        }
        Piece {
            id: c2
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "GPU // RADEON 8060S"; tag: Math.round(Core.gpu) + "%"; tagColor: Theme.coral
            Column {
                width: parent.width; spacing: 8
                Sparkline { width: parent.width; height: 76; values: Core.gpuHistory; color: Theme.coral }
                DossierRow { width: parent.width; key: "GTT"; value: Core.gttUsed.toFixed(1) + " / " + Core.gttTotal.toFixed(0) + " GB" }
                SegBar { width: parent.width; count: 28; value: Core.gttTotal > 0 ? Core.gttUsed / Core.gttTotal : 0; fillColor: Theme.violet }
                DossierRow { width: parent.width; key: "VRAM (UMA)"; value: (Core.metrics.vram_used_gb || 0).toFixed(2) + " / " + (Core.metrics.vram_total_gb || 0).toFixed(1) + " GB" }
                DossierRow { width: parent.width; key: "ТЕМПЕРАТУРА"; value: Math.round(Core.tempGpu) + "°C" }
                DossierRow { width: parent.width; key: "ИИ-СКОРОСТЬ"; value: Core.llmState === "ready" ? Core.tokensPerSec.toFixed(0) + " ТОК/С" : Core.llmState.toUpperCase(); valueColor: Theme.violet }
            }
        }
        Piece {
            id: c4
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "MEMORY // 64 GB UNIFIED"
            Column {
                width: parent.width; spacing: 8
                DossierRow { width: parent.width; key: "ОЗУ"; value: Core.ramUsed.toFixed(1) + " / " + Core.ramTotal.toFixed(0) + " GB" }
                SegBar { width: parent.width; count: 28; value: Core.ramTotal > 0 ? Core.ramUsed / Core.ramTotal : 0; fillColor: Theme.teal }
                DossierRow { width: parent.width; key: "GPU (GTT)"; value: Core.gttUsed.toFixed(1) + " GB" }
                SegBar { width: parent.width; count: 28; value: Core.ramTotal > 0 ? Core.gttUsed / Core.ramTotal : 0; fillColor: Theme.violet }
                DossierRow { width: parent.width; key: "БАТАРЕЯ"; value: Core.battery >= 0 ? Core.battery + "%" + (Core.charging ? " ⚡" : "") : "AC"; valueColor: Core.battery >= 0 && Core.battery <= 20 && !Core.charging ? Theme.coral : Theme.ink }
                SegBar { width: parent.width; count: 28; value: Core.battery >= 0 ? Core.battery / 100 : 1; fillColor: Core.battery >= 0 && Core.battery <= 20 ? Theme.coral : Theme.green }
                DossierRow { width: parent.width; key: "ДИСК"; value: (Core.metrics.disk_free_gb || 0) + " ГБ СВОБОДНО ИЗ " + (Core.metrics.disk_total_gb || 0) }
                SegBar { width: parent.width; count: 28; value: Core.metrics.disk_total_gb ? 1 - Core.metrics.disk_free_gb / Core.metrics.disk_total_gb : 0; fillColor: Theme.amber }
                DossierRow { width: parent.width; key: "ZRAM"; value: (Core.metrics.zram_used_gb || 0).toFixed(1) + " / " + (Core.metrics.zram_total_gb || 0).toFixed(0) + " GB" }
                DossierRow { width: parent.width; key: "АПТАЙМ"; value: (Core.metrics.uptime_hours || 0) + " Ч" }
            }
        }
        Piece {
            id: c3
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "NEURAL CORE // HAOTICA"; tag: (Core.haotica.state || "idle").toUpperCase(); tagColor: Theme.violet
            Item {
                width: parent.width; height: parent.height
                Image {
                    id: portrait
                    anchors { top: parent.top; horizontalCenter: parent.horizontalCenter }
                    width: Math.min(parent.width, 210); height: width * 260 / 240
                    fillMode: Image.PreserveAspectFit; smooth: true; asynchronous: true
                    source: "file://" + Theme.dataDir + "/avatar/" + (Core.haotica.state || "idle") + ".png"
                    onStatusChanged: if (status === Image.Error && source.toString().indexOf("/idle.png") < 0) source = "file://" + Theme.dataDir + "/avatar/idle.png"
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Quickshell.execDetached(["haotica", "open", "assistant"]) }
                }
                Glyph { visible: portrait.status !== Image.Ready; anchors.centerIn: portrait; name: "haotica"; size: 64; color: Theme.violet }
                DecodeText {
                    anchors { left: parent.left; right: parent.right; top: portrait.bottom; topMargin: 8 }
                    target: Core.haotica.text || "HAOTICA ONLINE. СПРОСИ ЧТО-НИБУДЬ — SUPER+A."
                    color: Theme.ink; font.family: Theme.fontUi; font.pixelSize: 12; wrapMode: Text.Wrap; maximumLineCount: 3; elide: Text.ElideRight
                }
            }
        }

        Piece {
            id: c5
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "NETWORK // RECON"; tag: Core.netName !== "" ? "ONLINE" : "OFFLINE"; tagColor: Core.netName !== "" ? Theme.teal : Theme.coral
            Item {
                width: parent.width; height: parent.height
                Canvas {
                    id: globe
                    anchors { right: parent.right; top: parent.top }
                    width: 96; height: 96
                    property real phase: 0
                    Timer { interval: 66; repeat: true; running: dash.visible; onTriggered: { globe.phase += 0.05; globe.requestPaint(); } }
                    onPaint: {
                        const g = getContext("2d"); g.reset();
                        const cx = width / 2, cy = height / 2, r = width / 2 - 3;
                        g.strokeStyle = Theme.sky; g.lineWidth = 1; g.globalAlpha = 0.85;
                        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
                        for (let i = 0; i < 4; i++) {
                            const k = Math.cos(globe.phase + i * Math.PI / 4);
                            g.beginPath(); g.ellipse(cx - Math.abs(k) * r, cy - r, Math.abs(k) * r * 2, r * 2); g.globalAlpha = 0.25 + 0.5 * Math.abs(k); g.stroke();
                        }
                        g.globalAlpha = 0.5;
                        for (const yy of [-0.5, 0, 0.5]) { const w = Math.sqrt(1 - yy * yy) * r; g.beginPath(); g.moveTo(cx - w, cy + yy * r); g.lineTo(cx + w, cy + yy * r); g.stroke(); }
                    }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Quickshell.execDetached(["haotica", "open", "netrecon"]) }
                }
                Column {
                    anchors { left: parent.left; right: globe.left; rightMargin: 10; top: parent.top }
                    spacing: 8
                    DossierRow { width: parent.width; key: "СЕТЬ"; value: Core.netName || "—" }
                    DossierRow { width: parent.width; key: "IP"; value: Core.netIp || "—" }
                    DossierRow { width: parent.width; key: "ПИНГ"; value: Core.netPing >= 0 ? Core.netPing + " ms" : "—" }
                }
                Column {
                    anchors { left: parent.left; right: parent.right; top: globe.bottom; topMargin: 8 }
                    spacing: 8
                    Sparkline { width: parent.width; height: 54; values: Core.netHistory; color: Theme.sky; maxValue: Math.max(100, Math.max.apply(null, Core.netHistory.concat([1]))) }
                    DossierRow { width: parent.width; key: "↓ ПРИЁМ"; value: Core.netDown.toFixed(0) + " КБ/С" }
                    DossierRow { width: parent.width; key: "УСТРОЙСТВ"; value: String(Core.metrics.recon_devices || 0) + ((Core.metrics.recon_unknown || 0) > 0 ? "  ·  НОВЫХ " + Core.metrics.recon_unknown : ""); valueColor: (Core.metrics.recon_unknown || 0) > 0 ? Theme.amber : Theme.ink }
                }
            }
        }
        Piece {
            id: c7
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "WEATHER // " + (dash.weather.place || "—").toUpperCase(); tag: dash.wc.label_en || ""; tagColor: Theme.sky
            Column {
                width: parent.width; spacing: 6
                Row {
                    spacing: 14
                    Glyph { name: dash.wc.glyph || "cloud"; size: 46; color: Theme.sky; anchors.verticalCenter: parent.verticalCenter }
                    Text { text: dash.wc.temperature_2m !== undefined ? Math.round(dash.wc.temperature_2m) + "°" : "—"; color: Theme.ink; font.family: Theme.fontDisplay; font.pixelSize: 54; font.weight: Font.Black }
                    Column {
                        anchors.verticalCenter: parent.verticalCenter
                        Text { text: (dash.wc.label || "").toUpperCase(); color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11 }
                        Text { text: "ОЩУЩ. " + (dash.wc.apparent_temperature !== undefined ? Math.round(dash.wc.apparent_temperature) + "°" : "—") + "  ·  ВЕТЕР " + (dash.wc.wind_speed_10m !== undefined ? Math.round(dash.wc.wind_speed_10m) + " КМ/Ч" : "—"); color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10 }
                    }
                }
                Repeater {
                    model: (dash.wd.time || []).slice(1, 6)
                    Row {
                        id: drow
                        required property var modelData
                        required property int index
                        width: parent.width; spacing: 8
                        Text { width: 72; text: Qt.formatDate(new Date(drow.modelData), "ddd dd").toUpperCase(); color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11 }
                        Text { width: 60; text: Math.round(dash.wd.temperature_2m_min[drow.index + 1]) + "° / " + Math.round(dash.wd.temperature_2m_max[drow.index + 1]) + "°"; color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 11 }
                        SegBar { width: parent.width - 150; anchors.verticalCenter: parent.verticalCenter; count: 10; segHeight: 5; value: (dash.wd.precipitation_probability_max[drow.index + 1] || 0) / 100; fillColor: Theme.sky }
                    }
                }
            }
        }
        Piece {
            id: c8
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "CALENDAR // " + Qt.formatDate(clock.date, "dd MMMM").toUpperCase(); tag: dash.agenda.length + " СОБЫТИЙ"; tagColor: Theme.amber
            Column {
                width: parent.width; spacing: 7
                Text { visible: dash.agenda.length === 0; text: "НИЧЕГО НЕ ЗАПЛАНИРОВАНО"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.5 }
                Repeater {
                    model: dash.agenda
                    Row {
                        id: arow
                        required property var modelData
                        width: parent.width; spacing: 10
                        Rectangle { width: 3; height: 30; color: arow.modelData.color || Theme.accent }
                        Column {
                            width: parent.width - 14
                            Text { width: parent.width; text: arow.modelData.summary; color: Theme.ink; elide: Text.ElideRight; font.family: Theme.fontUi; font.pixelSize: 12 }
                            Text { text: arow.modelData.allday ? Qt.formatDate(new Date(arow.modelData.start), "ddd dd.MM") + " · ВЕСЬ ДЕНЬ" : Qt.formatDateTime(new Date(arow.modelData.start), "ddd dd.MM · HH:mm"); color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10 }
                        }
                    }
                }
            }
        }
        Piece {
            id: c6
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredWidth: 1
            title: "EVENT LOG"; tag: (Core.events || []).length + " ЗАПИСЕЙ"
            Column {
                width: parent.width; spacing: 4
                Repeater {
                    model: (Core.events || []).slice(-14)
                    Text {
                        required property var modelData
                        width: parent.width
                        text: "> " + (modelData.time || "") + "  " + (modelData.text || "")
                        color: modelData.kind === "error" ? Theme.coral : (modelData.kind === "haotica" ? Theme.violet : (modelData.kind === "security" ? Theme.amber : Theme.dim))
                        font.family: Theme.fontMono; font.pixelSize: 11
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }
}
