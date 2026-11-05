// Макет моста Qt (window.hy) для Playwright: фальшивая «оболочка» PowerShell с OSC 133/7.
// Записи в PTY копятся в window.__writes, вызовы моста — в window.__calls.
(() => {
  const P = window.__MOCK || {};
  Object.defineProperty(navigator, "platform", { get: () => P.navPlatform || "Win32" });
  const sig = () => { const fns = []; return { connect: (f) => fns.push(f), emit: (...a) => fns.forEach((f) => f(...a)) }; };
  const calls = (window.__calls = []);
  const writes = (window.__writes = {});
  const sessions = {};
  let n = 0;
  const E = "\x1b", A = "\x07";
  const prompt = (s) => `${E}]7;file://pc/${s.cwd.replaceAll("\\", "/")}${A}${E}]133;A${A}PS ${s.cwd}> ${E}]133;B${A}`;
  const hy = {
    ptyData: sig(), ptyExit: sig(), message: sig(), themeChanged: sig(),
    boot: (cb) => cb(JSON.stringify(window.HY_BOOT)),
    setTitle: (t) => calls.push(["setTitle", t]), close: () => calls.push(["close"]), forceClose: () => calls.push(["forceClose"]),
    minimize: () => calls.push(["minimize"]), toggleMaximize: () => calls.push(["toggleMaximize"]),
    toggleFullscreen: () => calls.push(["toggleFullscreen"]), setOnTop: (v) => calls.push(["setOnTop", v]),
    startMove: () => {}, startResize: () => {}, notify: (t, b) => calls.push(["notify", t, b]),
    openUrl: (u) => calls.push(["openUrl", u]), openApp: (a, j) => calls.push(["openApp", a, j]),
    runAsAdmin: (j) => calls.push(["runAsAdmin", j]),
    ptyProfiles: (cb) => cb(JSON.stringify({ default: "pwsh", profiles: [
      { id: "pwsh", name: "PowerShell 7", kind: "pwsh" }, { id: "powershell", name: "Windows PowerShell", kind: "pwsh" },
      { id: "cmd", name: "Командная строка", kind: "cmd" }, { id: "wsl:Ubuntu", name: "WSL · Ubuntu", kind: "wsl", distro: "Ubuntu" }] })),
    ptySpawnProfile: (profile, cwd, cols, rows, cmd, cb) => {
      const sid = "s" + (++n);
      sessions[sid] = { profile, cwd: cwd && /^[A-Za-z]:/.test(cwd) ? cwd : "C:\\Users\\test", line: "", busy: false };
      writes[sid] = "";
      calls.push(["spawn", profile, cwd, cmd]);
      cb(sid);
      setTimeout(() => hy.ptyData.emit(sid, prompt(sessions[sid])), 20);
    },
    ptyWrite: (sid, data) => {
      const s = sessions[sid]; if (!s) return;
      writes[sid] += data;
      let echo = "";
      for (const ch of data) {
        if (ch === "\r") {
          const line = s.line; s.line = "";
          let out = "\r\n";
          if (line.trim()) {
            out += `${E}]7777;cmd=${btoa(unescape(encodeURIComponent(line)))}${A}${E}]133;C${A}`;
            let code = 0;
            const m = line.match(/^exit (\d+)$/);
            if (m) code = +m[1];
            else if (line.startsWith("cd ")) s.cwd = line.slice(3).trim();
            else if (line === "many") out += Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\r\n") + "\r\n";
            else out += `out: ${line}\r\n`;
            out += `${E}]133;D;${code}${A}`;
          }
          hy.ptyData.emit(sid, echo + out + prompt(s)); echo = "";
        } else if (ch === "\x7f") { s.line = s.line.slice(0, -1); echo += "\b \b"; }
        else if (ch >= " " && ch.length === 1 && !data.startsWith(E)) { s.line += ch; echo += ch; }
      }
      if (echo) hy.ptyData.emit(sid, echo);
    },
    ptyResize: () => {}, ptyAck: () => {}, ptyKill: (sid) => { calls.push(["kill", sid]); delete sessions[sid]; },
    ptyInfo: (sid, cb) => cb(JSON.stringify({ busy: !!(sessions[sid] && sessions[sid].busy), name: "python" })),
  };
  window.__mock = { sessions, emit: (sid, d) => hy.ptyData.emit(sid, d), exit: (sid, c) => hy.ptyExit.emit(sid, c),
    message: (m) => hy.message.emit(JSON.stringify(m)) };
  window.hy = hy;
  if (!P.wizard) window.__hyNoWizard = true;
  window.HY_BOOT = { app: "terminal", args: P.args || [], token: P.token, core: location.origin, haotica: "http://127.0.0.1:47810",
    lang: "ru", home: "C:\\Users\\test", user: "test", multi: true, title: "Терминал", platform: "windows", sep: "\\",
    features: { platform: "windows", recon: false, power_profiles: false, updates: false } };
})();
