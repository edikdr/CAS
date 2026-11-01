pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "../theme"

// HYPERINA: живые данные от ядра (метрики, Haotica, события) и вызовы API ядра
Singleton {
    id: root

    readonly property string runtimeDir: Theme.runtimeDir
    readonly property string coreUrl: "http://127.0.0.1:47800"
    readonly property string haoticaUrl: "http://127.0.0.1:47810"
    property string token: ""

    property var metrics: ({})
    property var haotica: ({ state: "idle", text: "" })
    property var events: []
    property bool coreOnline: false

    // история для графиков (60 точек)
    property var cpuHistory: []
    property var gpuHistory: []
    property var netHistory: []

    readonly property real cpu: metrics.cpu !== undefined ? metrics.cpu : 0
    readonly property real gpu: metrics.gpu !== undefined ? metrics.gpu : 0
    readonly property real ramUsed: metrics.ram_used_gb || 0
    readonly property real ramTotal: metrics.ram_total_gb || 64
    readonly property real gttUsed: metrics.gtt_used_gb || 0
    readonly property real gttTotal: metrics.gtt_total_gb || 56
    readonly property real tempCpu: metrics.temp_cpu || 0
    readonly property real tempGpu: metrics.temp_gpu || 0
    readonly property int fan: metrics.fan_rpm || 0
    readonly property string powerProfile: metrics.power_profile || "balanced"
    readonly property real battery: metrics.battery !== undefined ? metrics.battery : -1
    readonly property bool charging: metrics.charging === true
    readonly property bool onBattery: metrics.on_battery === true
    readonly property string netName: metrics.net_name || ""
    readonly property int netPing: metrics.net_ping_ms !== undefined ? metrics.net_ping_ms : -1
    readonly property string netIp: metrics.net_ip || ""
    readonly property real netDown: metrics.net_down_kbs || 0
    readonly property string kbLayout: metrics.kb_layout || "DE"
    readonly property bool gameMode: metrics.game_mode === true
    readonly property real tokensPerSec: metrics.llm_tps || 0
    readonly property string llmState: metrics.llm_state || "offline"
    readonly property int uptimeDays: metrics.uptime_days || 0

    onGameModeChanged: Theme.gameMode = gameMode
    onOnBatteryChanged: Theme.onBattery = onBattery

    function push(arr, v) {
        const a = arr.slice(Math.max(0, arr.length - 59));
        a.push(v);
        return a;
    }

    FileView {
        path: root.runtimeDir + "/metrics.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: {
            try {
                root.metrics = JSON.parse(text());
                root.coreOnline = true;
                root.cpuHistory = root.push(root.cpuHistory, root.cpu);
                root.gpuHistory = root.push(root.gpuHistory, root.gpu);
                root.netHistory = root.push(root.netHistory, root.netDown);
            } catch (e) { }
        }
        onLoadFailed: root.coreOnline = false
    }
    FileView {
        path: root.runtimeDir + "/haotica.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: { try { root.haotica = JSON.parse(text()); } catch (e) { } }
    }
    FileView {
        path: root.runtimeDir + "/events.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: { try { root.events = JSON.parse(text()); } catch (e) { } }
    }
    FileView {
        path: Theme.homeDir + "/.local/state/hyperina/token"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: root.token = text().trim()
    }

    // ── вызовы API ───────────────────────────────────────────────
    function request(base, method, path, body, cb) {
        const xhr = new XMLHttpRequest();
        xhr.open(method, base + path);
        xhr.setRequestHeader("X-Hyperina-Token", root.token);
        if (body !== undefined && body !== null) xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== XMLHttpRequest.DONE) return;
            let data = null;
            try { data = JSON.parse(xhr.responseText); } catch (e) { data = xhr.responseText; }
            if (cb) cb(xhr.status, data);
        };
        xhr.send(body !== undefined && body !== null ? JSON.stringify(body) : null);
    }
    function api(method, path, body, cb) { request(coreUrl, method, path, body, cb); }
    function haoticaApi(method, path, body, cb) { request(haoticaUrl, method, path, body, cb); }

    function setSetting(key, value) { api("POST", "/api/settings", { changes: { [key]: value } }, null); }
    function logEvent(kind, text) { api("POST", "/api/events", { kind: kind, text: text }, null); }
}
