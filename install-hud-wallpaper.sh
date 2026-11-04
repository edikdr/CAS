#!/usr/bin/env bash
# ============================================================================
# HAOTICA OS — УСТАНОВКА ОРИГИНАЛЬНЫХ ЖИВЫХ ОБОЕВ С ПОЛУТОНОВЫМ БЮСТОМ ИЗ ТОЧЕК,
# 3D-ТОЧЕЧНЫМ ГЛОБУСОМ, ВИДЖЕТОМ ВРЕМЕНИ (16:46) И ДОСЬЕ СИСТЕМЫ НА UBUNTU
# ============================================================================
set -euo pipefail

mkdir -p "$HOME/Pictures/Haotica-Wallpapers" "$HOME/.local/bin" "$HOME/.config/systemd/user"

cat << 'PYEOF' > "$HOME/.local/bin/haotica-render-hud-wallpaper.py"
#!/usr/bin/env python3
import math
import os
import subprocess
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    import psutil
except ImportError:
    psutil = None

OUT_DIR = Path.home() / "Pictures" / "Haotica-Wallpapers"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 1. Исходник статуи
STATUE_CANDIDATES = [
    Path("/usr/share/haotica/assets/art/statue-source.png"),
    Path.home() / "haotica-ubuntu/assets/art/statue-source.png",
    OUT_DIR / "statue-source.png",
]
statue_src = None
for c in STATUE_CANDIDATES:
    if c.exists() and c.stat().st_size > 10000:
        statue_src = c
        break

if not statue_src:
    statue_src = OUT_DIR / "statue-source.png"
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/edikdr/CAS/hyprina-os/assets/art/statue-source.png",
        statue_src
    )

# Надёжная загрузка TrueType шрифта
def get_font(size: int, bold: bool = False):
    bold_paths = [
        "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-B.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    ]
    reg_paths = [
        "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ]
    for p in (bold_paths if bold else reg_paths) + reg_paths + bold_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

W, H = 2560, 1600
bg0    = (0, 0, 0)
bg1    = (13, 13, 11)
ink    = (232, 223, 201)   # #E8DFC9
dim    = (163, 155, 135)   # #A39B87
line   = (59, 56, 47)      # #3B382F
lineHi = (133, 127, 110)   # #857F6E
amber  = (224, 162, 67)    # #E0A243
teal   = (95, 168, 160)    # #5FA8A0
coral  = (224, 112, 90)    # #E0705A
violet = (167, 163, 240)   # #A7A3F0

base = Image.new("RGB", (W, H), bg0)
d = ImageDraw.Draw(base)

# 2. Точечная матрица фона в правой части
step = 32
dotc = tuple(int(c * 0.9) for c in line)
for y in range(96, H - 64, step):
    for x in range(int(W * 0.38), W - 64, step):
        d.rectangle((x, y, x + 1, y + 1), fill=dotc)

# 3. Полутоновый бюст из точек (точный алгоритм statue_grid + render_statue_layer из core/haotica/art.py)
sh = int(H * 0.80)
cell = 6
im = Image.open(statue_src).convert("L")
bbox = im.point(lambda v: 255 if v > 28 else 0).getbbox()
if bbox:
    pad = 10
    im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad)))
w_s = round(im.width * sh / im.height)
gw, gh = max(1, w_s // cell), max(1, sh // cell)
small = im.resize((gw, gh), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))
mask = im.resize((gw, gh), Image.BILINEAR).point(lambda v: 255 if v > 24 else 0)

px, mk = small.load(), mask.load()
hi = (242, 236, 220)
statue_layer = Image.new("RGBA", (gw * cell, gh * cell), (0, 0, 0, 0))
ds = ImageDraw.Draw(statue_layer)
rmax = cell * 0.47
phase = (time.time() % 60) * 0.12

for y in range(gh):
    for x in range(gw):
        v = px[x, y] / 255.0
        v = max(0.0, min(1.0, (v - 0.07) / 0.86)) ** 1.25
        breath = 1.0 + 0.10 * math.sin(x * 0.21 + phase) * math.sin(y * 0.17 - phase * 0.8)
        r = rmax * v * breath
        if mk[x, y] and r < 0.45 and v > 0.0:
            continue
        if r >= 0.45:
            cx_p, cy_p = x * cell + cell / 2, y * cell + cell / 2
            col = hi if v > 0.92 else ink
            ds.ellipse((cx_p - r, cy_p - r, cx_p + r, cy_p + r), fill=(*col, 255))

sx, sy = int(W * 0.045), H - sh - int(H * 0.035)

# Рамка вокруг статуи
fx0, fy0 = sx - 18, sy + int(sh * 0.32)
fx1, fy1 = sx + int(sh * 0.48), H - int(H * 0.035) + 6
d.rectangle((fx0, fy0, fx1, fy1), outline=line, width=1)
d.line((fx1 - 140, fy0 - 120, fx1 - 140, fy0), fill=line, width=1)
d.rectangle((fx1 - 22, fy0 + 16, fx1 - 12, fy0 + 26), fill=dim)
d.rectangle((fx0 + 22, fy1 - 40, fx0 + 34, fy1 - 28), fill=dim)

f_small = get_font(15, False)
f_lbl   = get_font(19, True)
d.text((fx0 + 14, fy1 - 24), "///", font=f_small, fill=dim)

# Маркер HAOTICA / SIMPLE / FLEXIBLE / YOURS
d.rectangle((sx, int(H * 0.07) + 2, sx + 5, int(H * 0.07) + 20), fill=ink)
d.text((sx + 14, int(H * 0.07)), "HAOTICA", font=f_lbl, fill=ink)
for i, word in enumerate(("SIMPLE", "FLEXIBLE", "YOURS")):
    d.text((sx + 4, int(H * 0.07) + 44 + i * 24), word, font=f_small, fill=dim)

# Вертикальная подпись вдоль правого края
vt = Image.new("RGBA", (480, 26), (0, 0, 0, 0))
ImageDraw.Draw(vt).text((0, 2), "SUBJECT // MARBLE-01 . HALFTONE . LIVE", font=f_small, fill=(*dim, 255))
vt = vt.rotate(90, expand=True)
base.paste(vt, (W - 56, int(H * 0.30)), vt)

# Прицельные крестики
for (cx_k, cy_k) in ((int(W * 0.62), int(H * 0.86)), (int(W * 0.92), int(H * 0.18)), (int(W * 0.40), int(H * 0.12))):
    d.line((cx_k - 7, cy_k, cx_k + 7, cy_k), fill=dim)
    d.line((cx_k, cy_k - 7, cx_k, cy_k + 7), fill=dim)

# Зерно плёнки
try:
    noise = Image.effect_noise((W, H), 12).convert("L").point(lambda v: max(0, v - 120) // 9)
    base = Image.composite(Image.new("RGB", (W, H), ink), base, noise)
except Exception:
    pass

base.paste(statue_layer, (sx, sy), statue_layer)

# 4. 3D ТОЧЕЧНЫЙ ГЛОБУС В ПРАВОМ НИЖНЕМ УГЛУ (из shell/hud/Hud.qml)
globe_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dg = ImageDraw.Draw(globe_layer)
g_cx, g_cy, g_R = W - 70, H - 140, 290
tilt = 0.38
st, ct = math.sin(tilt), math.cos(tilt)
rot = (time.time() * 0.04) % (math.pi * 2)

def proj(lat_deg, lon_deg):
    la = math.radians(lat_deg)
    lo = math.radians(lon_deg) + rot
    x = math.cos(la) * math.sin(lo)
    y = math.sin(la)
    z = math.cos(la) * math.cos(lo)
    y2 = y * ct - z * st
    z2 = y * st + z * ct
    return (g_cx + x * g_R, g_cy - y2 * g_R, z2)

for lat in range(-75, 76, 15):
    for lon in range(0, 360, 4):
        px_g, py_g, pz_g = proj(lat, lon)
        if pz_g > 0 and 0 <= px_g < W and 0 <= py_g < H:
            alpha = int((0.18 + pz_g * 0.62) * 255)
            dg.rectangle((px_g, py_g, px_g + 2, py_g + 2), fill=(*ink, alpha))

for lon in range(0, 360, 20):
    for lat in range(-88, 89, 4):
        px_g, py_g, pz_g = proj(lat, lon)
        if pz_g > 0 and 0 <= px_g < W and 0 <= py_g < H:
            alpha = int((0.12 + pz_g * 0.45) * 255)
            dg.rectangle((px_g, py_g, px_g + 1.5, py_g + 1.5), fill=(*ink, alpha))

base = Image.alpha_composite(base.convert("RGBA"), globe_layer).convert("RGB")
d = ImageDraw.Draw(base)

f_log = get_font(15, False)
d.text((int(W * 0.77), H - 245), "NET // VODAFONE-D37C  .  1 MS", font=f_log, fill=teal)

# 5. ЛОГ СОБЫТИЙ ВНИЗУ ПО ЦЕНТРУ
now = datetime.now() + timedelta(minutes=5)
log_x, log_y = int(W * 0.355), H - 365
for idx, (ts, msg) in enumerate([
    (now.strftime("%H:%M:23"), "> PARTICLE FLOW ............ 1"),
    (now.strftime("%H:%M:43"), "> ORBITAL OBJECT ........... TRACKED"),
    (now.strftime("%H:%M:04"), "> STRUCTURAL LOSS .......... 0.02%"),
]):
    d.text((log_x, log_y + idx * 24), ts, font=f_log, fill=lineHi)
    d.text((log_x + 95, log_y + idx * 24), msg, font=f_log, fill=dim)

# 6. КРУПНЫЕ ЧАСЫ СПРАВА ВВЕРХУ (+5 минут)
f_clock = get_font(132, True)
f_day   = get_font(14, True)
f_date  = get_font(17, False)

time_txt = now.strftime("%H:%M")
day_txt  = now.strftime("%A").upper()
date_txt = now.strftime("%d.%m.%Y") + "  .  " + now.strftime("%S") + "s"

clock_right = W - 82
clock_top   = 112
tb = d.textbbox((0, 0), time_txt, font=f_clock)
tw = tb[2] - tb[0]
d.text((clock_right - tw, clock_top), time_txt, font=f_clock, fill=ink)

plate_y = clock_top + 158
day_b = d.textbbox((0, 0), day_txt, font=f_day)
day_w = (day_b[2] - day_b[0]) + 28
date_b = d.textbbox((0, 0), date_txt, font=f_date)
date_w = date_b[2] - date_b[0]

row_start_x = clock_right - (day_w + 18 + date_w)
d.polygon([
    (row_start_x + 6, plate_y),
    (row_start_x + day_w, plate_y),
    (row_start_x + day_w - 6, plate_y + 26),
    (row_start_x, plate_y + 26),
], fill=ink)
d.text((row_start_x + 13, plate_y + 5), day_txt, font=f_day, fill=bg0)
d.text((row_start_x + day_w + 16, plate_y + 4), date_txt, font=f_date, fill=dim)

# Чередуем a/b, чтобы GNOME Shell гарантированно обновлял обои без кэширования старого файла
slot = "a" if int(time.time() // 20) % 2 == 0 else "b"
out_file = OUT_DIR / f"haotica-hud-live-{slot}.png"
base.save(out_file, "PNG")
base.save(OUT_DIR / "haotica-hud-live.png", "PNG")

uri = f"file://{out_file}"
subprocess.run(["gsettings", "set", "org.gnome.desktop.background", "picture-options", "zoom"], capture_output=True)
subprocess.run(["gsettings", "set", "org.gnome.desktop.background", "picture-uri", uri], capture_output=True)
subprocess.run(["gsettings", "set", "org.gnome.desktop.background", "picture-uri-dark", uri], capture_output=True)
print(f"OK: {out_file}")
PYEOF

chmod +x "$HOME/.local/bin/haotica-render-hud-wallpaper.py"

PY_BIN="/opt/haotica/venv/bin/python3"
[ -x "$PY_BIN" ] || PY_BIN="/usr/bin/python3"

# Запускаем рендер прямо сейчас
"$PY_BIN" "$HOME/.local/bin/haotica-render-hud-wallpaper.py"

# Создаём фоновый таймер systemd, чтобы часы (HH:MM), CPU% и 3D-глобус обновлялись каждые 20 секунд
cat << EOF > "$HOME/.config/systemd/user/haotica-live-wallpaper.service"
[Unit]
Description=Haotica OS Live HUD Wallpaper Updater (Statue + 3D Globe + Clock + Dossier)

[Service]
Type=oneshot
ExecStart=$PY_BIN $HOME/.local/bin/haotica-render-hud-wallpaper.py
EOF

cat << 'TIMEREOF' > "$HOME/.config/systemd/user/haotica-live-wallpaper.timer"
[Unit]
Description=Update Haotica HUD Wallpaper every 20 seconds

[Timer]
OnBootSec=5s
OnUnitActiveSec=20s
AccuracySec=1s

[Install]
WantedBy=timers.target
TIMEREOF

systemctl --user daemon-reload
systemctl --user enable --now haotica-live-wallpaper.timer

echo "✓ Готово! Обои со статуей из точек, 3D-глобусом, часами и виджетом SYSTEM // DOSSIER установлены и обновляются автоматически!"
