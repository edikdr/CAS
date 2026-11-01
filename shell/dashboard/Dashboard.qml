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
    visible: Ui.dashboardOpen
    anchors { top: true; bottom: true; left: true; right: true }
    exclusionMode: ExclusionMode.Ignore
    color: Theme.alpha(Theme.bg0, 0.94)
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.namespace: "hyperina-dashboard"
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

    SystemClock { id: clock; precision: SystemClock.Seconds }
    readonly property var pieces: [c1, c2, c3, c4, c5, c6, title]

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
            text: "HYPERINA // " + Qt.formatDateTime(clock.date, "dd.MM.yyyy  HH:mm:ss") + "  //  UPTIME " + State.uptimeDays + "D"
            color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 13; font.letterSpacing: 1.4
        }
    }

    GridLayout {
        anchors { left: parent.left; right: parent.right; top: title.bottom; bottom: parent.bottom; margins: 56; topMargin: 28 }
        columns: 3
        rowSpacing: 22; columnSpacing: 22

        Piece {
            id: c1
            Layout.fillWidth: true; Layout.fillHeight: true
            title: "CPU // RYZEN AI MAX+ 392"; tag: Math.round(State.cpu) + "%"
            Column {
                width: parent.width; spacing: 10
                Sparkline { width: parent.width; height: 120; values: State.cpuHistory; color: Theme.teal }
                DossierRow { width: parent.width; key: "ТЕМПЕРАТУРА"; value: Math.round(State.tempCpu) + "°C" }
                DossierRow { width: parent.width; key: "ВЕНТИЛЯТОР"; value: State.fan > 0 ? State.fan + " RPM" : "—" }
                DossierRow { width: parent.width; key: "РЕЖИМ"; value: State.powerProfile.toUpperCase() }
            }
        }
        Piece {
            id: c2
            Layout.fillWidth: true; Layout.fillHeight: true
            title: "GPU // RADEON 8060S"; tag: Math.round(State.gpu) + "%"; tagColor: Theme.coral
            Column {
                width: parent.width; spacing: 10
                Sparkline { width: parent.width; height: 120; values: State.gpuHistory; color: Theme.coral }
                DossierRow { width: parent.width; key: "GTT"; value: State.gttUsed.toFixed(1) + " / " + State.gttTotal.toFixed(0) + " GB" }
                SegBar { width: parent.width; count: 32; value: State.gttTotal > 0 ? State.gttUsed / State.gttTotal : 0; fillColor: Theme.violet }
                DossierRow { width: parent.width; key: "ТЕМПЕРАТУРА"; value: Math.round(State.tempGpu) + "°C" }
            }
        }
        Piece {
            id: c3
            Layout.fillWidth: true; Layout.fillHeight: true
            title: "NEURAL CORE // HAOTICA"; tag: State.llmState.toUpperCase(); tagColor: Theme.violet
            Column {
                width: parent.width; spacing: 10
                DossierRow { width: parent.width; key: "СОСТОЯНИЕ"; value: (State.haotica.state || "idle").toUpperCase(); valueColor: Theme.violet }
                DossierRow { width: parent.width; key: "СКОРОСТЬ"; value: State.tokensPerSec.toFixed(1) + " ТОК/С" }
                DossierRow { width: parent.width; key: "МОДЕЛЬ"; value: State.metrics.llm_model || "—" }
                DossierRow { width: parent.width; key: "ОБЛАКО"; value: State.haotica.cloud_assist ? "☁ ASSIST" : "LOCAL" }
                DecodeText { width: parent.width; target: State.haotica.text || ""; color: Theme.ink; font.family: Theme.fontUi; font.pixelSize: 13; wrapMode: Text.Wrap; maximumLineCount: 4 }
            }
        }
        Piece {
            id: c4
            Layout.fillWidth: true; Layout.fillHeight: true
            title: "MEMORY // 64 GB UNIFIED"
            Column {
                width: parent.width; spacing: 10
                DossierRow { width: parent.width; key: "ОЗУ"; value: State.ramUsed.toFixed(1) + " / " + State.ramTotal.toFixed(0) + " GB" }
                SegBar { width: parent.width; count: 32; value: State.ramTotal > 0 ? State.ramUsed / State.ramTotal : 0; fillColor: Theme.teal }
                DossierRow { width: parent.width; key: "ZRAM"; value: (State.metrics.zram_used_gb || 0).toFixed(1) + " GB" }
                DossierRow { width: parent.width; key: "ДИСК"; value: (State.metrics.disk_free_gb || 0).toFixed(0) + " GB СВОБОДНО" }
            }
        }
        Piece {
            id: c5
            Layout.fillWidth: true; Layout.fillHeight: true
            title: "NETWORK // RECON"; tag: State.netName !== "" ? "ONLINE" : "OFFLINE"; tagColor: State.netName !== "" ? Theme.teal : Theme.coral
            Column {
                width: parent.width; spacing: 10
                Sparkline { width: parent.width; height: 70; values: State.netHistory; color: Theme.sky; maxValue: Math.max(100, Math.max.apply(null, State.netHistory.concat([1]))) }
                DossierRow { width: parent.width; key: "СЕТЬ"; value: State.netName || "—" }
                DossierRow { width: parent.width; key: "IP"; value: State.netIp || "—" }
                DossierRow { width: parent.width; key: "ПИНГ"; value: State.netPing >= 0 ? State.netPing + " ms" : "—" }
                DossierRow { width: parent.width; key: "УСТРОЙСТВ"; value: String(State.metrics.recon_devices || 0); valueColor: (State.metrics.recon_unknown || 0) > 0 ? Theme.amber : Theme.ink }
            }
        }
        Piece {
            id: c6
            Layout.fillWidth: true; Layout.fillHeight: true
            title: "EVENT LOG"
            Column {
                width: parent.width; spacing: 4
                Repeater {
                    model: (State.events || []).slice(-10)
                    Text {
                        required property var modelData
                        width: parent.width
                        text: "> " + (modelData.time || "") + "  " + (modelData.text || "")
                        color: modelData.kind === "error" ? Theme.coral : (modelData.kind === "haotica" ? Theme.violet : Theme.dim)
                        font.family: Theme.fontMono; font.pixelSize: 11
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }
}
