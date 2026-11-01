pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtQuick.Effects
import QtMultimedia
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Services.Pam
import "../theme"
import "../services"
import "../components"

// Блокировка в стиле досье SUBJECT: лицо (ИК-камера через PAM/howdy) или пароль
Scope {
    id: root
    property alias locked: lock.locked
    property string status: "SCANNING"
    property string message: ""
    property bool needPassword: false
    property bool failed: false
    readonly property string user: Quickshell.env("USER") || "user"
    property string inceptDate: "—"
    readonly property bool faceEnabled: !(Theme.s.security && Theme.s.security.face_unlock === false)

    function engage() {
        if (lock.locked) return;
        lock.locked = true;
        Sound.play("win_close");
    }

    FileView {
        path: "/etc/haotica/install.env"
        onLoaded: {
            const m = text().match(/INSTALL_DATE=([0-9-]+)/);
            if (m) root.inceptDate = m[1].split("-").reverse().join("/");
        }
    }

    PamContext {
        id: pam
        config: "haotica-lock"
        onPamMessage: {
            root.message = pam.message;
            root.needPassword = pam.responseRequired;
            root.status = pam.responseRequired ? "ENTER PASSPHRASE" : "SCANNING";
        }
        onCompleted: result => {
            if (result === PamResult.Success) {
                root.status = "ACCESS GRANTED";
                root.failed = false;
                Sound.play("access");
                unlockDelay.restart();
            } else {
                root.status = "ACCESS DENIED";
                root.failed = true;
                Sound.play("error");
                retry.restart();
            }
        }
        onError: { root.status = "PAM ERROR"; retry.restart(); }
    }
    Timer { id: unlockDelay; interval: 650; onTriggered: lock.locked = false }
    Timer { id: retry; interval: 1200; onTriggered: if (lock.locked) { root.failed = false; pam.start(); } }

    WlSessionLock {
        id: lock
        onLockedChanged: {
            if (locked) { root.status = "SCANNING"; root.needPassword = false; pam.start(); }
            else pam.abort();
        }

        WlSessionLockSurface {
            id: surface
            color: Theme.bg0

            Image {
                anchors.fill: parent
                source: "file://" + Theme.dataDir + "/wallpapers/current/full.png"
                fillMode: Image.PreserveAspectCrop
                opacity: 0.18
            }

            // карточка досье
            Item {
                id: card
                width: 620; height: 760
                anchors.centerIn: parent
                HFrame { anchors.fill: parent; fill: Theme.alpha(Theme.bg1, 0.96); stroke: Theme.violet; nodeColor: Theme.violet }

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 22
                    spacing: 14

                    RowLayout {
                        Text { text: "SUBJECT // " + root.user.toUpperCase(); color: Theme.violet; font.family: Theme.fontPixel; font.pixelSize: 22; font.letterSpacing: 2; Layout.fillWidth: true }
                        Glyph { name: "lock"; size: 20; color: Theme.violet }
                    }

                    RowLayout {
                        spacing: 14
                        // живое изображение с камеры, обесцвеченное и в растре
                        Item {
                            Layout.preferredWidth: 300; Layout.preferredHeight: 230
                            HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: Theme.line; nodes: false }
                            CaptureSession {
                                id: capture
                                camera: Camera {
                                    id: cam
                                    active: lock.locked && root.faceEnabled
                                    cameraDevice: {
                                        const v = mediaDevices.videoInputs;
                                        for (let i = 0; i < v.length; i++) if (v[i].description.toLowerCase().indexOf("ir") < 0) return v[i];
                                        return mediaDevices.defaultVideoInput;
                                    }
                                }
                                videoOutput: video
                            }
                            MediaDevices { id: mediaDevices }
                            VideoOutput {
                                id: video
                                anchors.fill: parent; anchors.margins: 6
                                fillMode: VideoOutput.PreserveAspectCrop
                                visible: false
                            }
                            MultiEffect {
                                anchors.fill: video
                                source: video
                                saturation: -1.0
                                contrast: 0.55
                                brightness: 0.05
                                colorization: 0.55
                                colorizationColor: Theme.violet
                            }
                            Canvas {
                                anchors.fill: video
                                onPaint: {
                                    const ctx = getContext("2d");
                                    ctx.fillStyle = "black";
                                    for (let y = 0; y < height; y += 4)
                                        for (let x = 0; x < width; x += 4) ctx.fillRect(x + 3, y, 1, 4), ctx.fillRect(x, y + 3, 4, 1);
                                }
                            }
                            Rectangle {
                                id: scanBar
                                x: 6; width: parent.width - 12; height: 2
                                color: Theme.violet
                                opacity: 0.8
                                SequentialAnimation on y {
                                    running: lock.locked && !root.needPassword
                                    loops: Animation.Infinite
                                    NumberAnimation { from: 6; to: 222; duration: 1600 / Theme.scanSpeed; easing.type: Easing.InOutSine }
                                    NumberAnimation { from: 222; to: 6; duration: 1600 / Theme.scanSpeed; easing.type: Easing.InOutSine }
                                }
                            }
                            Text {
                                anchors.centerIn: parent
                                visible: !root.faceEnabled
                                text: "CAMERA OFF"
                                color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 12
                            }
                        }
                        // маска лица из контурных линий
                        Item {
                            Layout.fillWidth: true; Layout.preferredHeight: 230
                            HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: Theme.line; nodes: false }
                            Canvas {
                                id: mesh
                                anchors.fill: parent; anchors.margins: 14
                                property real t: 0
                                NumberAnimation on t { running: lock.locked; from: 0; to: 1; duration: 2600; loops: Animation.Infinite }
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
                                            const x = cx + a * rx * w;
                                            const y = cy + yy * ry + Math.sin(a * 3 + i) * 2 * (1 - Math.abs(yy));
                                            a <= -0.999 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
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
                                text: root.status === "ACCESS GRANTED" ? "FACE MATCH ✓" : (root.needPassword ? "FACE: NO MATCH" : "FACE MATCH …")
                                color: root.status === "ACCESS GRANTED" ? Theme.green : Theme.violet
                                font.family: Theme.fontMono; font.pixelSize: 11; font.letterSpacing: 1.2
                            }
                        }
                    }

                    // таблица досье
                    Column {
                        Layout.fillWidth: true
                        spacing: 9
                        DossierRow { width: parent.width; pixelSize: 14; key: "NAME"; value: root.user.toUpperCase() }
                        DossierRow { width: parent.width; pixelSize: 14; key: "INCEPT DATE"; value: root.inceptDate }
                        DossierRow { width: parent.width; pixelSize: 14; key: "SYSTEM STATE"; value: Core.coreOnline ? "STABLE" : "STANDBY"; valueColor: Core.coreOnline ? Theme.green : Theme.amber }
                        DossierRow { width: parent.width; pixelSize: 14; key: "THREAT ASSESSMENT"; value: "★ ★ ★"; valueColor: Theme.violet }
                        DossierRow { width: parent.width; pixelSize: 14; key: "ACCESS"; value: root.status; valueColor: root.failed ? Theme.coral : (root.status === "ACCESS GRANTED" ? Theme.green : Theme.ink) }
                    }

                    Sparkline { Layout.fillWidth: true; Layout.preferredHeight: 50; values: Core.cpuHistory; color: Theme.violet }

                    // пароль
                    Item {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 44
                        HFrame { anchors.fill: parent; fill: Theme.bg0; stroke: root.failed ? Theme.coral : (pass.activeFocus ? Theme.violet : Theme.line); nodes: false }
                        TextInput {
                            id: pass
                            anchors.fill: parent; anchors.margins: 12
                            echoMode: TextInput.Password
                            passwordCharacter: "■"
                            color: Theme.ink
                            font.family: Theme.fontMono; font.pixelSize: 16
                            focus: true
                            enabled: root.needPassword
                            onAccepted: { pam.respond(text); text = ""; root.status = "VERIFYING"; }
                            Text {
                                visible: pass.text === ""
                                text: root.needPassword ? "OR ENTER PASSPHRASE" : "СМОТРИТЕ В КАМЕРУ…"
                                color: Theme.dim; font: pass.font
                            }
                        }
                    }
                    Text { text: root.message; color: Theme.dim; font.family: Theme.fontMono; font.pixelSize: 11; Layout.fillWidth: true; elide: Text.ElideRight }
                }
            }
        }
    }
}
