import json, re, os, urllib.request

base = "/storage/emulated/0/Download"
out = base + "/sunniva-all"
DRY = False

def clean(s):
    return re.sub(r'[\\/:*?"<>|]', "", s).strip()

files = sorted((f for f in os.listdir(base) if re.fullmatch(r"\d+\.txt", f)),
               key=lambda f: int(f.split(".")[0]))
seen, total = set(), 0

for f in files:
    data = json.load(open(os.path.join(base, f), encoding="utf-8"))
    for t in data["results"]:
        if t.get("wrapperType") != "track" or not t.get("previewUrl"):
            continue
        key = (t["trackName"].lower(), t["artistName"].lower())
        if key in seen:
            continue
        seen.add(key)
        title = clean(t["trackName"])
        if t["collectionName"].endswith(" - Single"):
            folder = os.path.join(out, "Singles")
            name = f"{title}.m4a"
        else:
            folder = os.path.join(out, clean(t["collectionName"]))
            name = f'{t.get("trackNumber", 0):02d} - {title}.m4a'
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, name)
        if not DRY and not os.path.exists(path):
            req = urllib.request.Request(
                t["previewUrl"], headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as r, open(path, "wb") as fh:
                fh.write(r.read())
        total += 1
        print(path)

print(total, "tracks")
