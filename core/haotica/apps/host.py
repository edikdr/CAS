"""Хост приложений HAOTICA: окно Qt + QtWebEngine для каждого приложения.

Один процесс на приложение — у каждого свой app_id (haotica-<имя>), поэтому док и
правила Hyprland различают окна. Интерфейс приложений — HTML/CSS/JS из
/usr/share/haotica/apps/<имя>, загружается с ядра (127.0.0.1:47800). Связь со
страницей — объект `hy` через QWebChannel: управление окном, системный выбор файлов,
терминальные сессии (PTY).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
from pathlib import Path

from PySide6.QtCore import QFile, QIODevice, QObject, QSize, Qt, QTimer, QUrl, Signal, Slot
from PySide6.QtGui import QColor, QDesktopServices, QIcon
from PySide6.QtNetwork import QLocalServer, QLocalSocket
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineScript, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QFileDialog, QMainWindow

from .. import client, config, paths, util
from . import registry
from .pty import PtyManager

ORIGIN = f"http://{paths.HOST}:{paths.PORT_CORE}"
EDGES = {
    "left": Qt.Edge.LeftEdge, "right": Qt.Edge.RightEdge, "top": Qt.Edge.TopEdge, "bottom": Qt.Edge.BottomEdge,
}


def socket_path(name: str) -> str:
    return str(paths.RUNTIME_DIR / f"app-{name}.sock")


def _webchannel_js() -> str:
    f = QFile(":/qtwebchannel/qwebchannel.js")
    if f.open(QIODevice.OpenModeFlag.ReadOnly):
        return bytes(f.readAll()).decode()
    return ""


class Bridge(QObject):
    """Объект `hy` в JavaScript."""
    message = Signal(str)                 # JSON от хоста: повторный запуск с аргументами и т. п.
    ptyData = Signal(str, str)
    ptyExit = Signal(str, int)
    themeChanged = Signal()

    def __init__(self, win: "AppWindow") -> None:
        super().__init__(win)
        self.win = win

    # ── окно ───────────────────────────────────────────────────
    @Slot(result=str)
    def boot(self) -> str:
        return json.dumps(self.win.boot_data(), ensure_ascii=False)

    @Slot()
    def close(self) -> None:
        self.win.close()

    @Slot()
    def minimize(self) -> None:
        # в Hyprland нет «свернуть»: убираем окно на скрытый рабочий стол, док вернёт его
        util.spawn(["hyprctl", "dispatch", "movetoworkspacesilent", "special:minimized"])

    @Slot()
    def toggleMaximize(self) -> None:
        util.spawn(["hyprctl", "dispatch", "fullscreen", "1"])

    @Slot()
    def startMove(self) -> None:
        h = self.win.windowHandle()
        if h:
            h.startSystemMove()

    @Slot(str)
    def startResize(self, edges: str) -> None:
        h = self.win.windowHandle()
        if not h:
            return
        e = Qt.Edge(0)
        for part in edges.split("-"):
            e |= EDGES.get(part, Qt.Edge(0))
        if e:
            h.startSystemResize(e)

    @Slot(str)
    def setTitle(self, title: str) -> None:
        self.win.setWindowTitle(title[:200])

    @Slot(bool)
    def setVisible(self, visible: bool) -> None:
        self.win.setVisible(visible)

    # ── система ────────────────────────────────────────────────
    @Slot(str)
    def openUrl(self, url: str) -> None:
        if url.startswith(("http://", "https://", "mailto:", "file://")):
            QDesktopServices.openUrl(QUrl(url))

    @Slot(str, str)
    def openApp(self, name: str, args_json: str) -> None:
        try:
            args = [str(a) for a in json.loads(args_json or "[]")]
        except ValueError:
            args = []
        util.spawn(["haotica", "open", name, *args])

    @Slot(str, str, str, result=str)
    def pickFile(self, mode: str, title: str, start: str) -> str:
        start = os.path.expanduser(start or "~")
        if mode == "dir":
            return QFileDialog.getExistingDirectory(self.win, title or "Выбор папки", start) or ""
        if mode == "save":
            return QFileDialog.getSaveFileName(self.win, title or "Сохранить как", start)[0] or ""
        if mode == "multi":
            return json.dumps(QFileDialog.getOpenFileNames(self.win, title or "Открыть", start)[0])
        return QFileDialog.getOpenFileName(self.win, title or "Открыть", start)[0] or ""

    @Slot(str, str)
    def notify(self, title: str, body: str) -> None:
        util.notify(title, body, icon=f"haotica-{self.win.app.name}")

    # ── терминальные сессии ────────────────────────────────────
    @Slot(str, int, int, str, result=str)
    def ptySpawn(self, cwd: str, cols: int, rows: int, command: str) -> str:
        return self.win.host.pty.spawn(self, cwd, cols, rows, command)

    @Slot(str, str)
    def ptyWrite(self, sid: str, data: str) -> None:
        self.win.host.pty.write(sid, data)

    @Slot(str, int, int)
    def ptyResize(self, sid: str, cols: int, rows: int) -> None:
        self.win.host.pty.resize(sid, cols, rows)

    @Slot(str, int)
    def ptyAck(self, sid: str, chars: int) -> None:
        self.win.host.pty.ack(sid, chars)

    @Slot(str)
    def ptyKill(self, sid: str) -> None:
        self.win.host.pty.kill(sid)

    @Slot(str, result=str)
    def ptyInfo(self, sid: str) -> str:
        return json.dumps(self.win.host.pty.info(sid))


class Page(QWebEnginePage):
    """Наружу — только во внешний браузер: токен ядра не должен попасть на чужие страницы."""

    def acceptNavigationRequest(self, url: QUrl, nav_type, is_main_frame: bool) -> bool:  # noqa: N802
        s = url.toString()
        if s.startswith((ORIGIN + "/apps/", ORIGIN + "/ui/", "about:", "data:", "blob:")):
            return True
        if is_main_frame and url.scheme() in ("http", "https", "mailto"):
            QDesktopServices.openUrl(url)
        return False

    def createWindow(self, _type):  # noqa: N802 — target=_blank → внешний браузер
        page = QWebEnginePage(self.profile(), self)
        page.urlChanged.connect(lambda u: (QDesktopServices.openUrl(u), page.deleteLater()))
        return page

    def javaScriptConsoleMessage(self, level, message, line, source):  # noqa: N802
        if os.environ.get("HAOTICA_DEBUG"):
            print(f"[js] {source}:{line} {message}", file=sys.stderr)


class AppWindow(QMainWindow):
    def __init__(self, host: "Host", args: list[str]) -> None:
        super().__init__()
        self.host, self.app, self.args = host, host.app, args
        self.setWindowTitle(host.title)
        self.setWindowIcon(QIcon.fromTheme(f"haotica-{self.app.name}"))
        self.setWindowFlag(Qt.WindowType.FramelessWindowHint, True)
        self.setMinimumSize(QSize(360, 300))
        if self.app.transparent:
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.view = QWebEngineView(self)
        self.page = Page(host.profile, self.view)
        bg = QColor(0, 0, 0, 0) if self.app.transparent else QColor(host.bg)
        self.page.setBackgroundColor(bg)
        self.view.setPage(self.page)
        self.bridge = Bridge(self)
        self.channel = QWebChannel(self.page)
        self.channel.registerObject("hy", self.bridge)
        self.page.setWebChannel(self.channel)
        self.setCentralWidget(self.view)
        self._restore_geometry()
        self.page.loadFinished.connect(self._loaded)
        self._retry = 0
        self.load()

    def boot_data(self) -> dict:
        return {"app": self.app.name, "args": self.args, "token": client.token(), "core": ORIGIN,
                "haotica": f"http://{paths.HOST}:{paths.PORT_HAOTICA}", "lang": self.host.lang,
                "home": str(paths.HOME), "user": os.environ.get("USER", ""), "multi": self.app.multi,
                "title": self.host.title}

    def load(self) -> None:
        q = urllib.parse.quote(json.dumps(self.args))
        self.view.load(QUrl(f"{ORIGIN}/apps/{self.app.name}/index.html#args={q}"))

    def _loaded(self, ok: bool) -> None:
        if ok:
            self._retry = 0
            return
        self._retry += 1
        if self._retry == 1:
            util.spawn(["systemctl", "--user", "start", "haotica-core.service"])
        delay = min(5000, 600 * self._retry)
        self.page.setHtml(OFFLINE_HTML.replace("{BG}", self.host.bg).replace("{INK}", self.host.ink)
                          .replace("{ACC}", self.host.accent).replace("{N}", str(self._retry)), QUrl("about:blank"))
        QTimer.singleShot(delay, self.load)

    def deliver(self, msg: dict) -> None:
        self.bridge.message.emit(json.dumps(msg, ensure_ascii=False))

    # ── геометрия окна запоминается между запусками ──────────────
    def _geom_file(self) -> Path:
        return paths.DATA_DIR / "web" / self.app.name / "window.json"

    def _restore_geometry(self) -> None:
        d = util.load_json(self._geom_file(), None) or {}
        w, h = d.get("w") or self.app.size[0], d.get("h") or self.app.size[1]
        self.resize(int(w), int(h))

    def closeEvent(self, ev) -> None:  # noqa: N802
        if not self.isFullScreen():
            util.write_json(self._geom_file(), {"w": self.width(), "h": self.height()})
        self.host.window_closed(self)
        super().closeEvent(ev)


OFFLINE_HTML = """<!doctype html><meta charset=utf-8><style>
html,body{margin:0;height:100%;background:{BG};color:{INK};font:13px 'IBM Plex Mono',monospace;display:grid;place-items:center}
b{color:{ACC};letter-spacing:.18em}p{opacity:.7}</style>
<div><b>CORE LINK // LOST</b><p>Ядро HAOTICA не отвечает. Перезапускаю… попытка {N}</p></div>"""


class Host(QObject):
    def __init__(self, app: registry.App, args: list[str]) -> None:
        super().__init__()
        self.app = app
        s = config.load()
        self.lang = s.get("locale", {}).get("ui_language", "ru")
        self.title = app.ru if self.lang == "ru" else app.en
        t = util.load_json(paths.RUNTIME_DIR / "theme.json", {}) or {}
        cols = t.get("colors", {})
        self.bg, self.ink, self.accent = cols.get("bg0", "#000000"), cols.get("ink", "#E8DFC9"), cols.get("accent", "#E0A243")
        self.windows: list[AppWindow] = []
        self.pty = PtyManager()
        self.profile = self._profile()
        self.server = QLocalServer(self)
        path = socket_path(app.name)
        QLocalServer.removeServer(path)
        paths.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        self.server.listen(path)
        self.server.newConnection.connect(self._incoming)
        self.open(args)

    def _profile(self) -> QWebEngineProfile:
        store = paths.DATA_DIR / "web" / self.app.name
        store.mkdir(parents=True, exist_ok=True)
        prof = QWebEngineProfile(f"haotica-{self.app.name}", self)
        prof.setPersistentStoragePath(str(store / "storage"))
        prof.setCachePath(str(paths.CACHE_DIR / "web" / self.app.name))
        prof.setHttpUserAgent(prof.httpUserAgent() + f" HAOTICA/{self.app.name}")
        st = prof.settings()
        for attr, on in ((QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True),
                         (QWebEngineSettings.WebAttribute.JavascriptCanPaste, True),
                         (QWebEngineSettings.WebAttribute.LocalStorageEnabled, True),
                         (QWebEngineSettings.WebAttribute.WebGLEnabled, True),
                         (QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True),
                         (QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False),
                         (QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True),
                         (QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True),
                         (QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, False),
                         (QWebEngineSettings.WebAttribute.PdfViewerEnabled, True)):
            st.setAttribute(attr, on)
        s = QWebEngineScript()
        s.setName("haotica-boot")
        s.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        s.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        s.setRunsOnSubFrames(False)
        s.setSourceCode(_webchannel_js() + BOOT_JS.replace("__ORIGIN__", ORIGIN))
        prof.scripts().insert(s)
        try:                                            # Qt ≥ 6.8: единый API разрешений
            prof.setPersistentPermissionsPolicy(QWebEngineProfile.PersistentPermissionsPolicy.AskEveryTime)
        except AttributeError:
            pass
        return prof

    def _grant(self, page: QWebEnginePage) -> None:
        def on_perm(perm) -> None:            # Qt 6.8+
            if perm.origin().toString().rstrip("/") == ORIGIN:
                perm.grant()
            else:
                perm.deny()
        try:
            page.permissionRequested.connect(on_perm)
        except AttributeError:
            pass

    def open(self, args: list[str]) -> None:
        if self.windows and not self.app.multi:
            w = self.windows[-1]
            if "--toggle" in args:
                w.setVisible(not w.isVisible())
                if w.isVisible():
                    w.raise_()
                    w.activateWindow()
                return
            w.deliver({"cmd": "open", "args": args})
            w.show()
            w.raise_()
            w.activateWindow()
            return
        if self.windows and self.app.multi and "--new-tab" in args:
            self.windows[-1].deliver({"cmd": "open", "args": args})
            return
        w = AppWindow(self, [a for a in args if a != "--toggle"])
        self._grant(w.page)
        self.windows.append(w)
        w.show()

    def window_closed(self, w: AppWindow) -> None:
        if w in self.windows:
            self.windows.remove(w)
        if not self.windows:
            self.pty.kill_all()
            QTimer.singleShot(0, QApplication.instance().quit)

    def _incoming(self) -> None:
        conn: QLocalSocket = self.server.nextPendingConnection()

        def ready() -> None:
            raw = bytes(conn.readAll()).decode("utf-8", "replace")
            for ln in raw.splitlines():
                try:
                    msg = json.loads(ln)
                except ValueError:
                    continue
                if msg.get("cmd") == "open":
                    self.open([str(a) for a in msg.get("args", [])])
            conn.write(b"ok\n")
            conn.flush()
            conn.disconnectFromServer()
        conn.readyRead.connect(ready)


BOOT_JS = r"""
;(function () {
  if (location.origin !== "__ORIGIN__" || window.__hyBoot) return;
  window.__hyBoot = true;
  function start() {
    if (typeof QWebChannel === "undefined" || !window.qt || !qt.webChannelTransport) { return setTimeout(start, 20); }
    new QWebChannel(qt.webChannelTransport, function (ch) {
      window.hy = ch.objects.hy;
      window.hy.boot(function (b) {
        try { window.HY_BOOT = JSON.parse(b); } catch (e) { window.HY_BOOT = {}; }
        window.dispatchEvent(new Event("hy-ready"));
      });
    });
  }
  start();
})();
"""


def main(argv: list[str]) -> int:
    if not argv:
        print("использование: haotica-app <приложение> [аргументы…]")
        return 2
    app_def = registry.get(argv[0])
    if not app_def:
        print(f"нет приложения «{argv[0]}». Есть: {', '.join(registry.APPS)}")
        return 2
    os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS",
                          "--enable-gpu-rasterization --ignore-gpu-blocklist --enable-zero-copy "
                          "--enable-features=VaapiVideoDecodeLinuxGL --disable-renderer-backgrounding")
    os.environ.setdefault("QT_QPA_PLATFORM", "wayland;xcb")
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    qapp = QApplication([sys.argv[0]])
    qapp.setDesktopFileName(f"haotica-{app_def.name}")
    qapp.setApplicationName(f"haotica-{app_def.name}")
    qapp.setOrganizationName("HAOTICA")
    host = Host(app_def, argv[1:])
    qapp.setApplicationDisplayName(host.title)
    snap = os.environ.get("HAOTICA_SNAPSHOT")
    if snap:                       # отладка: снимок окна и выход (визуальные проверки без экрана)
        def shoot() -> None:
            for i, w in enumerate(host.windows):
                w.grab().save(snap if i == 0 else snap.replace(".png", f"-{i}.png"))
            if os.environ.get("HAOTICA_SNAPSHOT_STAY") != "1":
                qapp.quit()
        QTimer.singleShot(int(os.environ.get("HAOTICA_SNAPSHOT_DELAY", "4000")), shoot)
    return qapp.exec()
