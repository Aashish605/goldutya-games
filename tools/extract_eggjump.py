"""Extract sprites/textures/audio from Egg Jump Unity WebGL data file."""
import gzip
import io
import os
import sys
import urllib.request

BASE = "https://addictivegames.com/games/egg-jump/play/"
DATA_URL = BASE + "Build/Eggjump.data.unityweb"
OUT = os.path.join(os.path.dirname(__file__), "..", "ref", "eggjump")
RAW = os.path.join(OUT, "Eggjump.data.unityweb")

os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)
os.makedirs(os.path.join(OUT, "audio"), exist_ok=True)
os.makedirs(os.path.join(OUT, "text"), exist_ok=True)
os.makedirs(os.path.join(OUT, "direct"), exist_ok=True)


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"cached {dest} ({os.path.getsize(dest)} bytes)")
        return
    print(f"downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    print(f"saved {dest} ({os.path.getsize(dest)} bytes)")


def decompress(raw: bytes) -> bytes:
    if raw[:2] == b"\x1f\x8b":
        print("format: gzip")
        return gzip.decompress(raw)
    try:
        import brotli
        print("format: brotli")
        return brotli.decompress(raw)
    except Exception as e:
        raise SystemExit(f"unknown compression: {e} first bytes={raw[:8]!r}")


def direct_files():
    for rel in [
        "bg.jpg",
        "TemplateData/newlogo.png",
        "TemplateData/fulllscreenbutton.png",
        "TemplateData/Exitfulllscreenbutton.png",
        "manifest.json",
    ]:
        dest = os.path.join(OUT, "direct", rel.replace("/", "_"))
        try:
            fetch(BASE + rel, dest)
        except Exception as e:
            print(f"skip {rel}: {e}")
    try:
        fetch(
            "https://addictivegames.com/assets/images/eggjump.webp",
            os.path.join(OUT, "direct", "eggjump_promo.webp"),
        )
    except Exception as e:
        print(f"skip promo: {e}")


def main():
    fetch(DATA_URL, RAW)
    direct_files()

    raw = open(RAW, "rb").read()
    data = decompress(raw)
    dec_path = os.path.join(OUT, "Eggjump.data")
    with open(dec_path, "wb") as f:
        f.write(data)
    print(f"decompressed -> {dec_path} ({len(data)} bytes)")

    import UnityPy

    env = UnityPy.load(data)
    counts = {}
    for obj in env.objects:
        t = obj.type.name
        counts[t] = counts.get(t, 0) + 1
    print("object types:", dict(sorted(counts.items(), key=lambda kv: -kv[1])))

    for obj in env.objects:
        try:
            if obj.type.name == "Texture2D":
                d = obj.read()
                name = safe(d.m_Name)
                if not name:
                    continue
                img = d.image
                if img:
                    path = os.path.join(OUT, "textures", f"{name}.png")
                    img.save(path)
            elif obj.type.name == "Sprite":
                d = obj.read()
                name = safe(d.m_Name)
                if not name:
                    continue
                img = d.image
                if img:
                    img.save(os.path.join(OUT, "textures", f"sprite_{name}.png"))
            elif obj.type.name == "AudioClip":
                d = obj.read()
                name = safe(d.m_Name)
                for fname, sample in d.samples.items():
                    ext = os.path.splitext(fname)[1] or ".wav"
                    with open(os.path.join(OUT, "audio", f"{name}{ext}"), "wb") as f:
                        f.write(sample)
            elif obj.type.name in ("TextAsset", "ScriptableObject"):
                d = obj.read()
                name = safe(getattr(d, "m_Name", "") or getattr(d, "name", ""))
                if not name:
                    continue
                blob = getattr(d, "m_Script", None)
                if isinstance(blob, str):
                    with open(os.path.join(OUT, "text", f"{name}.txt"), "w",
                              encoding="utf-8", errors="replace") as f:
                        f.write(blob)
        except Exception as e:
            print(f"err {obj.type.name}: {e}")

    print("done")


def safe(n):
    return "".join(c if c.isalnum() or c in "-_ " else "_" for c in str(n)).strip()


if __name__ == "__main__":
    main()
