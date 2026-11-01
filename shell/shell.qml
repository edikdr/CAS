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

// ┌─ HYPERINA // SHELL ────────────────────────────────────────────┐
// │ Оболочка рабочего стола: обои, HUD, панель, док и оверлеи.      │
// │ Управление снаружи: qs -p /usr/share/hyperina/shell ipc call …  │
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
    LockScreen { id: lockScreen }
    GlitchOverlay {}
    PolkitDialog {}

    function toggle(prop, action) {
        if (action === "open") Ui[prop] = true;
        else if (action === "close") Ui[prop] = false;
        else Ui[prop] = !Ui[prop];
    }

    IpcHandler {
        target: "hyperina"
        function launcher(action: string): void { if (action === "close" || (action === "toggle" && Ui.launcherOpen)) Ui.launcherOpen = false; else launcherWin.open(); }
        function dashboard(action: string): void { shell.toggle("dashboardOpen", action); }
        function notifications(action: string): void { shell.toggle("notificationsOpen", action); }
        function control(action: string): void { shell.toggle("controlOpen", action); }
        function clipboard(action: string): void { shell.toggle("clipboardOpen", action); }
        function power(action: string): void { shell.toggle("powerOpen", action); }
        function haotica(action: string): void { Quickshell.execDetached(["hyperina", "open", "haotica", action === "open" ? "" : "--toggle"]); }
        function lock(): void { lockScreen.engage(); }
        function osd(kind: string, action: string): void {
            if (kind === "volume") osdCtl.volume(action);
            else if (kind === "mic") osdCtl.mic(action);
            else if (kind === "brightness") osdCtl.brightness(action);
            else if (kind === "keyboard") Ui.showOsd("keyboard", parseFloat(action) || 0, false);
        }
        function reloadTheme(): void { Theme.reload(); }
        function log(text: string): void { Ui.pushLog(text); }
        function ping(): string { return "HYPERINA SHELL ONLINE"; }
    }
}
