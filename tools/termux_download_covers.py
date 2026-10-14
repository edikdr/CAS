import json, re, os, urllib.request

base = "/storage/emulated/0/Download"
out = base + "/sunniva-all"
DRY = False

def clean(s):
    return re.sub(r'[\\/:*?"<>|]', "", s).strip()

def fetch(url, path):
    for size in ("1200x1200bb", "600x600bb"):
        try:
            req = urllib.request.Request(
                url.replace("100x100bb", size),
                headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as r, open(path, "wb") as f:
                f.write(r.read())
            return size
        except Exception:
            continue
    return None

files = sorted((f for f in os.listdir(base) if re.fullmatch(r"\d+\.txt", f)),
               key=lambda f: int(f.split(".")[0]))
seen, total = set(), 0

for f in files:
    data = json.load(open(os.path.join(base, f), encoding="utf-8"))
    for t in data["results"]:
        if t.get("wrapperType") != "track" or not t.get("artworkUrl100"):
            continue
        cid = t["collectionId"]
        if cid in seen:
            continue
        seen.add(cid)
        name = t["collectionName"]
        if name.endswith(" - Single"):
            folder = os.path.join(out, "Singles")
            file = clean(name[:-len(" - Single")]) + ".jpg"
        else:
            folder = os.path.join(out, clean(name))
            file = "cover.jpg"
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, file)
        if DRY or os.path.exists(path):
            print(path)
        else:
            size = fetch(t["artworkUrl100"], path)
            print(path, size or "FAILED")
        total += 1

print(total, "covers")
