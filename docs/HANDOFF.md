# HAOTICA — handoff spec for the next session (English, compact)

Repo `edikdr/CAS`, branch **`hyprina-os`** (worktree `/home/user/CAS/hyprina-os`). Push there; no PR unless asked.
The user (Russian speaker, UI is Russian) is **very low on usage limits**. Work autonomously, in few large steps, no questions, terse replies (Russian), no screenshots/long explorations unless a bug needs them. Commit + push after every milestone.

## 0. Goal
One file dropped on a fresh Arch install on a Lenovo Legion 7 15ASH11 (Ryzen AI Max+ 392, Radeon 8060S, 64 GB unified RAM, OLED 2560×1600@165) → run `./install.sh` once → reboot → **Haotica OS** boots into the greeter, logs in, shows the desktop, and the essentials work. Own extra apps come later (the user will build them after install), so **MVP = installer + working session + Haotica assistant + Settings + a few core apps**. Everything is specified in `docs/DESIGN.md` (v0.12, Russian) and `docs/ARCHITECTURE.md` (contract: paths/ports/units; slightly outdated: units are now `haotica-agent`, `haotica-llm-{base,deep,fast}`; no `-main/-vision`).

## 1. What already exists (do NOT redo; read only when touching it)
- **Installer framework** `install.sh`, `lib/{core,pkg,ui,detect}.sh`; modules `00 preflight, 05 snapshot, 10 base, 15 kernel, 20 gpu, 22 laptop, 25 audio, 28 network` (follow their style: `MOD_TITLE`, `MOD_CRITICAL`, `mod_run`, helpers `pac_install_list`, `write_root_file`, `install_root_tree`, `enable_system_unit`, `user_systemctl`…). Package lists in `modules/pkglists/*.txt` (desktop, runtime, apps, apps-aur, fonts, gaming, face-aur…).
- **Hyprland 0.57 Lua config** `config/hypr/` (validated with `Hyprland --verify-config`); generated files come from `core/haotica/theme.py` (`theme.lua`, `settings.lua`, `crt.frag`).
- **Quickshell shell** `shell/` (bar, dock, HUD, wallpaper, launcher, notifications, OSD, control center, dashboard, lock, polkit, power, clipboard, glitch overlay, services `Core/Ui/Sound`). Tested headless (sway + grim). **`shell/haotica/` is EMPTY** (Haotica side panel missing).
- **Greeter** `greeter/` (greetd + Hyprland + Quickshell; symlinks `theme`, `components` → `../shell/…`, installer must copy dereferenced `rsync -L`). Not wired to installer yet.
- **Core daemon** `core/haotica/server/*` (aiohttp :47800; settings, metrics, hypr events, game mode, screen CRT, display revert, files, sys/audio/bt/wifi/storage/updates/models routes, weather, calendar, notes, recon) + root helper `system/usr/lib/haotica/bin/haotica-helper` (polkit policy present) — tested with a local dev server.
- **Theme system** `theme.py/palette.py/icons.py/cursors.py/art.py` (GTK/Qt/Kvantum/icons/cursor/wallpapers/plymouth/CRT shader), audits in `tools/audit_icons.py`.
- **App runtime** `core/haotica/apps/{host,pty,registry}.py` (PySide6 QtWebEngine host, QWebChannel bridge, PTY) + web UI kit `apps/_ui/{hy.css,hy.js,glyphs.js,crt.js,avatar.js,vendor/xterm}`.
- **Terminal app** `apps/terminal/*` (Hyperion layout, CRT, hands-of-code background) and **portrait** app; avatar rig built by `tools/avatar/build.py`.
- **Agent parts** `core/haotica/agent/`: `safety.py`, `persona.py`, `memory.py`, `llm.py` (base⇄deep switching, per-model sampling), `search.py`, `cloud.py`, `voice.py`, `tools.py` (schemas + handlers, **untested**).
- **Models** `core/haotica/models.py`: base = Qwen3.8-27B UD-Q4_K_M + mmproj + DFlash draft; deep = Qwen3-Coder-Next 80B IQ4_XS; fast = Qwen3-1.7B. Sizes/SHA-256 verified from HF metadata. Units `system/usr/lib/systemd/user/haotica-{core,agent,llm-base,llm-deep,llm-fast,tts,shell,gestures}.service` + `haotica-session.target`.
- Dev tips: `pip` env has PySide6 6.12, Playwright+Chromium, opencv; arch chroot at `/opt/archroot/root.x86_64` (may not exist in a new container — then skip chroot tests, rely on `shellcheck`, `ruff`, `bash -n`, `python -m py_compile`, Playwright for web apps; Quickshell needs `qs` binary which is only in the chroot). Core dev server: `HOME=<tmp> XDG_RUNTIME_DIR=<tmp> HAOTICA_DEV_ROOT=$PWD PYTHONPATH=core python3 -m haotica.server`; token in `$HOME/.local/state/haotica/token` (`?token=` or `X-Haotica-Token`). Run `ruff check` on touched files.

## 2b. DONE in session 2 (do not redo)
P0-A agent server (`agent/{engine,server,router,__main__,agent_cli}.py`, smoke-tested with a fake llama-server: chat stream/wait, tool calls, danger card reject, shell completion, terminal block, memory, game mode, CLI `haotica ask`); P0-B apps `settings`, `assistant` (+`?embed=terminal`), `files`, `sysmon` (Playwright: no console errors), `shell/haotica/HaoticaPanel.qml` (Super+A; Super+Shift+A = window), `.desktop` generation `haotica desktop` (only existing apps) + fallback `mimeapps.list`, `apps.show_kde=true`; P0-C modules 30/32/35/40/50/80/90 + `haotica-models.service` (background download at login), full `--dry-run` passes (15/15) on a stubbed system; doctor updated; P1 README.md, VERSION, `tools/build_run.sh` → `dist/haotica-installer.run`, ARCHITECTURE units synced.
Still open: Hyprland `--verify-config` and Quickshell headless load of the new panel (no chroot in session 2), real-hardware run, router adapters, TTS/SearXNG, UI sounds, apps beyond MVP.

## 2. TODO — priority order (P0 = required for "OS works after first boot")

### P0-A Agent server (`core/haotica/agent/`): `engine.py`, `router.py` (stub OK), `server.py`, `__main__.py`, `agent_cli.py`
- aiohttp on `127.0.0.1:47810`, same token scheme as core. Routes: `GET /api/status`, `GET /api/stream` (SSE topics `state, mouth, card, message`), `POST /api/chat` (`{text, source, chat, context, wait}`; stream + wait modes), `GET /api/history`, `POST /api/clear`, `POST /api/card/{id}/accept|reject`, `POST /api/event`, `POST /api/reload`, `POST /api/complete/shell` (zsh-autosuggest backend, fast model), `POST /api/terminal/block` (proactive analysis of failed command), `/api/memory`, `/api/cloud/*` (key/models/ledger via `cloud.py`), `/api/llm/*` (status, `use base|deep`).
- Engine: turn loop (persona prompt from `persona.py`, route model via `LLM.route`, stream deltas, tool calls → `tools.Tools.run`, permission cards via asyncio futures when `Tools.needs_card`, history + summaries in `memory.py`, redaction via `safety.py`). Writes `$XDG_RUNTIME_DIR/haotica/haotica.json` (state, last line, `llm_state/tps/model/role`, `cloud_assist`) atomically. Haotica must work with **no cloud key and no TTS** (degrade silently). `haotica ask "…"` CLI command (`hy` alias in zsh) → POST /api/chat.
- Game mode already unloads LLM units (core side). Keep it.

### P0-B Apps (HTML/JS in `apps/<name>/`, window via `haotica-app <name>`; follow `apps/terminal` + `apps/_ui` kit; registry already lists all names)
MVP set only: **`assistant`** (Haotica chat window + `?embed=terminal` mode used by the terminal panel; cards [TAB]/[ESC], avatar, model badge base/deep, `/deep`), **`settings`** (pages: Appearance/profile/CRT sliders, Display incl. 15 s revert, Sound, Network (Wi-Fi/BT), Power, Keyboard/Locale, **Haotica** (mode, model mode auto/base/deep, context size, models download/verify/progress, OpenRouter key via keyring + model list + helper budgets), Apps (defaults), About/Doctor) — all backed by existing `/api/*` routes, **`files`** (minimal: browse, open, trash, preview), **`sysmon`** (processes/CPU/GPU/GTT/temps from `/api/metrics`+`/api/procs`), **`screenshot`** wrapper optional. Skip every other app: until the user writes them, `mimeapps` must point to the installed fallbacks (mpv, Chrome, KDE okular/gwenview/kate/dolphin) and `apps.show_kde` default must be **true** (flip `defaults.toml` + launcher filter if needed). Generate `.desktop` files from `registry.py` only for apps that exist (`core/haotica/desktop.py`).
- Add `shell/haotica/` (QML): side panel that embeds/launches the assistant window + shows state from `haotica.json`; bind in `config/hypr/haotica/binds.lua` if missing.

### P0-C Installer modules (same style as existing ones; each idempotent, `--dry-run` aware)
`30-desktop` (pkglists desktop/fonts; install `shell/`, `greeter/` (rsync -L), `assets` to `/usr/share/haotica`; greetd config from `system/etc/greetd`; enable greetd), `32-runtime` (copy `core/haotica` → `/usr/lib/haotica/python`, `system/usr/bin|lib|share|etc` trees, polkit policy, helper, user units `systemctl --user enable` via `enable_user_unit_global`, `/opt/haotica/venv` only if pip deps are missing from pkglists), `35-theme` (`haotica theme apply --assets`, fonts, plymouth `haotica theme plymouth`, `theme export-system`, cursor/icon theme, system shader at `/usr/share/haotica/shaders/crt.frag`), `40-apps` (pkglists apps(+aur via paru/yay bootstrap), `.desktop` generation, mimeapps, KDE fallback), `50-ai` (build llama.cpp tag **b12032** with `-DGGML_VULKAN=ON` to `/opt/haotica/llama.cpp`; `haotica models download` in background unless `--no-models`; tts/searxng **skipped** for MVP), `80-user` (zsh + ZDOTDIR integration from `apps/terminal/shell`, dotfiles, `~/.config/hypr` copy incl. `user.lua`, first `theme apply`, `usermod` groups), `90-finish` (doctor, summary, reboot prompt). Defer `55-face`, `60-gestures`, `70-gaming` (only add `steam gamemode mangohud` pkglist install if trivial). Never weaken signature/TLS checks.
- `haotica doctor` must report every service/port and be run by `90-finish`.

### P0-D Verification (no real hardware here)
`shellcheck` all scripts, `bash -n`, a `--dry-run` of the full installer in a clean arch container/chroot if available, `ruff check core tools`, `Hyprland --verify-config` on the generated config, Quickshell headless load of `shell/` and `greeter/` (chroot only), Playwright smoke test per app (no console errors) against the dev core server, agent server smoke test with a fake llama-server (`haotica models args base` already prints correct flags). Fix what breaks.

### P1 (only if budget remains)
README (Russian, ≤1 page: how to install, first boot, keys), `dist/haotica-installer.run` (tar.gz + self-extracting header; build script in `tools/`), sync `docs/ARCHITECTURE.md` with the real unit names, minimal UI sounds (generate with `ffmpeg` sine/noise recipes, no paid APIs; if absent set `sound.ui_sounds=false`), router adapters (FRITZ!Box TR-064, OpenWrt ubus, MikroTik REST) in `agent/router.py`, TTS service (Chatterbox ROCm venv) + SearXNG podman unit.

## 3. Non-negotiable rules (from the user, keep in force)
- Sparkasse (bank) runs only in an isolated browser profile with **no** Haotica access; `safety.ALWAYS_DENIED` covers it.
- Secrets/tokens/keys redacted before any model (local or cloud). Keys live in the system keyring (libsecret), never in files.
- Dangerous-command filter + confirmation card always on, regardless of persona/swearing level.
- Cloud helpers (DeepSeek V4.1 Flash `deepseek/deepseek-v4.1-flash`, Claude Haiku 5.5 `anthropic/claude-haiku-5.5`, via OpenRouter) are available **to both local models without a card**, only for public info with context-free briefs; local data ⇒ permission card. Never rephrase to bypass a provider refusal; budgets/limits as in DESIGN §15.5.
- Router changes need confirmation + config backup. Deep network scans only on the user's own subnet.
- Do not put model identifiers in commits/PRs/code comments. Use the commit attribution lines the harness shows you. Don't create PRs unless asked. Don't touch TLS/signature verification.
- Style: cyber-retro (OLED black, amber/teal/violet), CRT on terminal 0.85 / avatar +0.25 / whole screen 0.35 (off in game mode and fullscreen), window open/close CRT+GLITCH at 0.7×, SCAN/DECODE 0.5×; keep icons/cursors symmetric (`python3 tools/audit_icons.py` must print OK after icon edits).

## 4. Known unverified (never ran on real hardware)
Hyprland screen shader and window animations on the GPU; llama.cpp b12032 Vulkan build, `--spec-type draft-dflash` for Qwen3.8 (launcher auto-falls back without the draft); Quickshell on real session (only headless sway tested); greetd login flow; face/gesture/TTS stacks (not started).

## 5. Definition of done (MVP)
Fresh Arch + `./install.sh --yes` completes without manual steps (models may download in background); after reboot: greetd greeter → login → Hyprland with Quickshell bar/dock/launcher, terminal opens, Settings opens and changes apply live, `haotica doctor` green, Haotica answers in terminal and assistant window once the base model has downloaded (clear "model downloading N%" state before that), Game Mode toggles, `--dry-run` and re-run are safe.

---
# PROMPT to paste into the new session

```
You continue the project "Haotica OS" in repo edikdr/CAS, branch hyprina-os (worktree /home/user/CAS/hyprina-os; if missing, `git fetch origin hyprina-os && git worktree add` or checkout it). First read ONLY docs/HANDOFF.md fully — it is your spec (current state, TODO by priority, rules, definition of done) — then skim docs/ARCHITECTURE.md headings. Do not re-explore the repo broadly and do not redo anything listed as done.

The user is nearly out of usage limits. Work autonomously and efficiently: no questions, terse Russian status messages, no screenshots unless debugging, batch big edits, commit and push to hyprina-os after every milestone (agent server → settings+assistant+files+sysmon apps and shell/haotica panel → installer modules 30/32/35/40/50/80/90 → verification → P1 if budget remains). If you must cut scope, cut from the bottom of the list, never the installer or the agent server. Respect every rule in section 3 of the handoff. Finish with a short Russian report: what works, what is untested on real hardware, and the exact command to install.
```
