//@ pragma UseQApplication
//@ pragma Env QT_QUICK_FLICKABLE_WHEEL_DECELERATION=10000
pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Io
import "theme"
import "services"
import "bar"
import "dock"
import "wallpaper"
import "hud"
import "launcher"
import "notifications"
import "osd"
import "control"
import "power"
import "dashboard"
import "lock"
import "glitch"
import "polkit"
import "clipboard"
import "haotica"

// ┌─ HAOTICA // SHELL ────────────────────────────────────────────┐
// │ Оболочка рабочего стола: обои, HUD, панель, док и оверлеи.      │
// │ Управление снаружи: qs -p /usr/share/haotica/shell ipc call …  │
// └────────────────────────────────────────────────────────────────┘
ShellRoot {
    id: shell

    Variants {
        model: Quickshell.screens
        delegate: Component {
            Scope {
                id: perScreen
                required property var modelData
                Wallpaper { modelData: perScreen.modelData }
                Hud { modelData: perScreen.modelData }
                Bar { modelData: perScreen.modelData }
                Dock { modelData: perScreen.modelData }
            }
        }
    }

    Launcher { id: launcherWin }
    Notifications {}
    Osd { id: osdCtl }
    ControlCenter {}
    Dashboard {}
    PowerMenu { onLockRequested: lockScreen.engage() }
    ClipboardPanel {}
    HaoticaPanel {}
    LockScreen { id: lockScreen }
    GlitchOverlay {}
    PolkitDialog {}

    function toggle(prop, action) {
        if (action === "open") Ui[prop] = true;
        else if (action === "close") Ui[prop] = false;
        else Ui[prop] = !Ui[prop];
    }

    IpcHandler {
        target: "haotica"
        function launcher(action: string): void { if (action === "close" || (action === "toggle" && Ui.launcherOpen)) Ui.launcherOpen = false; else launcherWin.open(); }
        function dashboard(action: string): void { shell.toggle("dashboardOpen", action); }
        function notifications(action: string): void { shell.toggle("notificationsOpen", action); }
        function control(action: string): void { shell.toggle("controlOpen", action); }
        function clipboard(action: string): void { shell.toggle("clipboardOpen", action); }
        function power(action: string): void { shell.toggle("powerOpen", action); }
        function haotica(action: string): void { shell.toggle("haoticaOpen", action); }
        function assistant(): void { Quickshell.execDetached(["haotica", "open", "assistant"]); }
        function lock(): void { lockScreen.engage(); }
        function osd(kind: string, action: string): void {
            if (kind === "volume") osdCtl.volume(action);
            else if (kind === "mic") osdCtl.mic(action);
            else if (kind === "brightness") osdCtl.brightness(action);
            else if (kind === "keyboard") Ui.showOsd("keyboard", parseFloat(action) || 0, false);
        }
        function reloadTheme(): void { Theme.reload(); }
        function log(text: string): void { Ui.pushLog(text); }
        function ping(): string { return "HAOTICA SHELL ONLINE"; }
        function snapshot(dir: string): string {
            const out = [];
            for (const w of Ui.windows) {
                if (!w.win || !w.win.visible || !w.win.contentItem) continue;
                // корневой элемент окна создан не движком QML — снимаем его дочерние элементы
                const kids = w.win.contentItem.children;
                for (let i = 0; i < kids.length; i++) {
                    const item = kids[i];
                    if (!item || !item.visible || item.width < 2 || item.height < 2) continue;
                    const name = w.name + "-" + out.length;
                    const a = w.win.anchors || {};
                    const pos = item.mapToItem(null, 0, 0);
                    out.push({ name: name, win: w.name, x: pos.x, y: pos.y, w: item.width, h: item.height, ww: w.win.width, wh: w.win.height,
                               top: !!a.top, bottom: !!a.bottom, left: !!a.left, right: !!a.right,
                               mt: w.win.margins ? w.win.margins.top : 0, mb: w.win.margins ? w.win.margins.bottom : 0,
                               ml: w.win.margins ? w.win.margins.left : 0, mr: w.win.margins ? w.win.margins.right : 0 });
                    const ok = item.grabToImage(function(res) { res.saveToFile(dir + "/" + name + ".png"); });
                    if (!ok) console.log("snapshot failed", name);
                }
            }
            return JSON.stringify(out);
        }
    }
}
