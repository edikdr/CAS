//@ pragma UseQApplication
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtQuick.Effects
import QtMultimedia
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Services.Greetd
import "theme"
import "components"

// ┌─ HAOTICA // GREETER ─────────────────────────────────────────┐
// │ Экран входа в стиле досье SUBJECT. После включения — пароль    │
// │ (он разблокирует связку ключей); вход по лицу — опционально.   │
// └────────────────────────────────────────────────────────────────┘
ShellRoot {
    id: root
    property var users: []
    property int userIndex: 0
    readonly property string user: users.length > 0 ? users[userIndex].name : ""
    property string status: "STANDBY"
    property bool needInput: false
    property bool echo: false
    property bool failed: false
    property string message: ""
    property string inceptDate: "—"
    property string preferredUser: ""

    FileView {
        path: "/etc/passwd"
        onLoaded: {
            const out = [];
            for (const line of text().split("\n")) {
                const f = line.split(":");
                if (f.length < 7) continue;
                const uid = parseInt(f[2]);
                if (uid >= 1000 && uid < 60000 && !/(nologin|false)$/.test(f[6])) out.push({ name: f[0], full: (f[4] || "").split(",")[0] });
            }
            root.users = out;
            root.pickPreferred();
        }
    }
    FileView {
        path: "/etc/haotica/install.env"
        onLoaded: {
            const d = text().match(/INSTALL_DATE=([0-9-]+)/);
            if (d) root.inceptDate = d[1].split("-").reverse().join("/");
            const u = text().match(/HY_USER=([A-Za-z0-9_.-]+)/);
            if (u) { root.preferredUser = u[1]; root.pickPreferred(); }
        }
    }
    function pickPreferred() {
        for (let i = 0; i < users.length; i++) if (users[i].name === preferredUser) userIndex = i;
    }

    function begin() {
        if (user === "") return;
        failed = false;
        status = "SCANNING";
        Greetd.createSession(user);
    }

    Connections {
        target: Greetd
        function onAuthMessage(message, error, responseRequired, echoResponse) {
            root.message = message;
            root.needInput = responseRequired;
            root.echo = echoResponse;
            root.status = responseRequired ? "ENTER PASSPHRASE" : "SCANNING";
            if (!responseRequired) Greetd.respond("");
        }
        function onAuthFailure(message) {
            root.status = "ACCESS DENIED";
            root.message = message;
            root.failed = true;
            retry.restart();
        }
        function onReadyToLaunch() {
            root.status = "ACCESS GRANTED";
            outro.start();
        }
        function onError(error) { root.status = "ERROR"; root.message = error; retry.restart(); }
    }
    Timer { id: retry; interval: 1400; onTriggered: { Greetd.cancelSession(); root.begin(); } }
    Timer { id: autostart; interval: 900; running: true; onTriggered: root.begin() }

    PanelWindow {
        id: win
        anchors { top: true; bottom: true; left: true; right: true }
        exclusionMode: ExclusionMode.Ignore
        color: Theme.bg0
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
        WlrLayershell.namespace: "haotica-greeter"

        Image {
            anchors.fill: parent
            source: "file:///usr/share/haotica/wallpapers/default/full.png"
            fillMode: Image.PreserveAspectCrop
            opacity: 0.22
        }

        Item {
            id: card
            width: 640; height: 800
            anchors.centerIn: parent
            clip: true
            property real reveal: 0
            NumberAnimation on reveal { from: 0; to: 1; duration: 1100 / Theme.scanSpeed; easing.type: Easing.OutCubic }

            Item {
                width: parent.width
                height: parent.height * card.reveal
                clip: true
                Item {
                    width: card.width; height: card.height
                    HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg1, 0.97); stroke: Theme.violet; nodeColor: Theme.violet }

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 22
                        spacing: 14
                        RowLayout {
                            Text { text: "SUBJECT // " + root.user.toUpperCase(); color: Theme.violet; font.family: Theme.fontPixel; font.pixelSize: 24; font.letterSpacing: 2; Layout.fillWidth: true }
                            Text { text: "HAOTICA"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 2 }
                        }
                        RowLayout {
                            spacing: 14
                            Item {
                                Layout.preferredWidth: 300; Layout.preferredHeight: 230
                                HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: Theme.line; nodes: false }
                                MediaDevices { id: devices }
                                CaptureSession {
                                    camera: Camera {
                                        active: true
                                        cameraDevice: {
                                            const v = devices.videoInputs;
                                            for (let i = 0; i < v.length; i++) if (v[i].description.toLowerCase().indexOf("ir") < 0) return v[i];
                                            return devices.defaultVideoInput;
                                        }
                                    }
                                    videoOutput: video
                                }
                                VideoOutput { id: video; anchors.fill: parent; anchors.margins: 6; fillMode: VideoOutput.PreserveAspectCrop; visible: false }
                                MultiEffect {
                                    anchors.fill: video
                                    source: video
                                    saturation: -1.0
                                    contrast: 0.6
                                    colorization: 0.55
                                    colorizationColor: Theme.violet
                                }
                                Canvas {
                                    anchors.fill: video
                                    onPaint: {
                                        const ctx = getContext("2d");
                                        ctx.fillStyle = "black";
                                        for (let y = 0; y < height; y += 4)
                                            for (let x = 0; x < width; x += 4) { ctx.fillRect(x + 3, y, 1, 4); ctx.fillRect(x, y + 3, 4, 1); }
                                    }
                                }
                                Rectangle {
                                    x: 6; width: parent.width - 12; height: 2; color: Theme.violet; opacity: 0.85
                                    SequentialAnimation on y {
                                        loops: Animation.Infinite
                                        NumberAnimation { from: 6; to: 222; duration: 1600 / Theme.scanSpeed; easing.type: Easing.InOutSine }
                                        NumberAnimation { from: 222; to: 6; duration: 1600 / Theme.scanSpeed; easing.type: Easing.InOutSine }
                                    }
                                }
                            }
                            Item {
                                Layout.fillWidth: true; Layout.preferredHeight: 230
                                HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: Theme.line; nodes: false }
                                Canvas {
                                    id: mesh
                                    anchors.fill: parent; anchors.margins: 14
                                    property real t: 0
                                    NumberAnimation on t { from: 0; to: 1; duration: 2600; loops: Animation.Infinite }
                                    onTChanged: requestPaint()
                                    onPaint: {
                                        const ctx = getContext("2d");
                                        ctx.reset();
                                        const cx = width / 2, cy = height / 2, rx = width * 0.33, ry = height * 0.44;
                                        for (let i = 0; i < 16; i++) {
                                            const yy = -1 + i / 7.5;
                                            ctx.beginPath();
                                            for (let a = -1; a <= 1.001; a += 0.05) {
                                                const w = Math.sqrt(Math.max(0, 1 - yy * yy));
                                                const x = cx + a * rx * w, y = cy + yy * ry + Math.sin(a * 3 + i) * 2 * (1 - Math.abs(yy));
                                                if (a <= -0.999) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                                            }
                                            const near = Math.abs(i / 15 - t) < 0.08;
                                            ctx.strokeStyle = near ? Theme.violet : Theme.alpha(Theme.violet, 0.35);
                                            ctx.lineWidth = near ? 1.4 : 1;
                                            ctx.stroke();
                                        }
                                    }
                                }
                                Text {
                                    anchors { bottom: parent.bottom; horizontalCenter: parent.horizontalCenter; bottomMargin: 8 }
                                    text: root.status === "ACCESS GRANTED" ? "MATCH ✓" : "IDENTIFYING …"
                                    color: root.status === "ACCESS GRANTED" ? Theme.green : Theme.violet
                                    font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.2
                                }
                            }
                        }
                        Column {
                            Layout.fillWidth: true
                            spacing: 9
                            Item {
                                width: parent.width; height: 20
                                DossierRow { anchors.fill: parent; pixelSize: 14; key: "NAME"; value: root.user.toUpperCase() + (root.users.length > 1 ? "  ◀▶" : "") }
                                MouseArea {
                                    anchors.fill: parent
                                    enabled: root.users.length > 1
                                    onClicked: { root.userIndex = (root.userIndex + 1) % root.users.length; Greetd.cancelSession(); root.begin(); }
                                }
                            }
                            DossierRow { width: parent.width; pixelSize: 14; key: "INCEPT DATE"; value: root.inceptDate }
                            DossierRow { width: parent.width; pixelSize: 14; key: "FUNCTION"; value: "OPERATOR" }
                            DossierRow { width: parent.width; pixelSize: 14; key: "SYSTEM STATE"; value: "STABLE"; valueColor: Theme.green }
                            DossierRow { width: parent.width; pixelSize: 14; key: "THREAT ASSESSMENT"; value: "★ ★ ★"; valueColor: Theme.violet }
                            DossierRow { width: parent.width; pixelSize: 14; key: "ACCESS"; value: root.status; valueColor: root.failed ? Theme.coral : (root.status === "ACCESS GRANTED" ? Theme.green : Theme.ink) }
                        }
                        // низ досье: синусоида на сетке и столбцы цифр (SUBJECT A-34)
                        Item {
                            Layout.fillWidth: true; Layout.preferredHeight: 58
                            Canvas {
                                id: wave
                                anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
                                width: parent.width - digits.width - 14
                                property real t: 0
                                Timer { interval: 50; running: true; repeat: true; onTriggered: { wave.t += 0.06; wave.requestPaint(); } }
                                onPaint: {
                                    const g = getContext("2d"); g.reset();
                                    g.strokeStyle = Theme.alpha(Theme.violet, 0.16); g.lineWidth = 1;
                                    for (let x = 0.5; x < width; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, height); g.stroke(); }
                                    for (let y = 0.5; y < height; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke(); }
                                    g.fillStyle = Theme.violet;
                                    for (let x = 0; x < width; x += 14) for (let y = 0; y < height; y += 14) g.fillRect(x - 1, y - 1, 3, 3);
                                    g.strokeStyle = Theme.violet; g.lineWidth = 1.6; g.beginPath();
                                    const amp = root.status === "VERIFYING" ? 0.42 : 0.28;
                                    for (let x = 0; x <= width; x += 2) {
                                        const y = height / 2 + Math.sin(x / 18 + wave.t * 3) * height * amp * Math.sin(Math.PI * x / width);
                                        x ? g.lineTo(x, y) : g.moveTo(x, y);
                                    }
                                    g.stroke();
                                }
                            }
                            Column {
                                id: digits
                                anchors { right: parent.right; verticalCenter: parent.verticalCenter }
                                spacing: 1
                                property int tick: 0
                                Timer { interval: 180; running: true; repeat: true; onTriggered: digits.tick++ }
                                Repeater {
                                    model: 4
                                    Text {
                                        required property int index
                                        text: { void digits.tick; let r = ""; for (let i = 0; i < 4; i++) r += Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, "0") + " "; return r.trim(); }
                                        color: index === 0 ? Theme.violet : Theme.dim; font.family: Theme.fontMono; font.pixelSize: 9; font.letterSpacing: 1
                                    }
                                }
                            }
                        }
                        Text { text: root.needInput ? "OR ENTER PASSPHRASE" : "LOOK AT THE CAMERA"; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 2.4 }
                        Item {
                            Layout.fillWidth: true; Layout.preferredHeight: 44
                            HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: root.failed ? Theme.coral : (pass.activeFocus ? Theme.violet : Theme.line); nodes: false }
                            TextInput {
                                id: pass
                                anchors.fill: parent; anchors.margins: 12
                                focus: true
                                echoMode: root.echo ? TextInput.Normal : TextInput.Password
                                passwordCharacter: "■"
                                color: Theme.ink; font.family: Theme.fontMono; font.pixelSize: 16
                                onAccepted: { if (root.needInput) { Greetd.respond(text); text = ""; root.status = "VERIFYING"; } }
                                Keys.onTabPressed: { if (root.users.length > 1) { root.userIndex = (root.userIndex + 1) % root.users.length; Greetd.cancelSession(); root.begin(); } }
                                Text { visible: pass.text === ""; text: root.needInput ? "ENTER PASSPHRASE" : "…"; color: Theme.dim; font: pass.font }
                            }
                        }
                        Text { Layout.fillWidth: true; text: root.message; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11; elide: Text.ElideRight }
                        Text { text: "⏎ : ВОЙТИ   TAB : ПОЛЬЗОВАТЕЛЬ   ALT+SHIFT : РАСКЛАДКА"; color: Theme.lineHi; font.family: Theme.fontMono; font.pixelSize: 10; font.letterSpacing: 1 }
                    }
                }
            }
            Rectangle { y: card.height * card.reveal; width: card.width; height: 2; color: Theme.violet; visible: card.reveal < 1 }
        }

        // финал: экран «рассыпается» точками и запускается сессия
        Rectangle { id: fade; anchors.fill: parent; color: "black"; opacity: 0 }
    }

    SequentialAnimation {
        id: outro
        NumberAnimation { target: card; property: "scale"; to: 1.04; duration: 260; easing.type: Easing.OutQuad }
        NumberAnimation { target: fade; property: "opacity"; to: 1; duration: 420 }
        ScriptAction { script: Greetd.launch(["start-hyprland"], [], true) }
    }
}
