"""
Generates public/og.png, the social preview card.

It reads the pixel maps and palette straight out of src/lib/mascot.ts so the
card can never drift from the artwork the app actually renders. Twitter and
most link unfurlers will not render SVG, which is why this one frame is baked
to PNG. Run: python scripts/make-og.py
"""

import re
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT / "src" / "lib" / "mascot.ts").read_text(encoding="utf-8")
OUT = ROOT / "public" / "og.png"

MOOD = "happy"  # The card shows the mascot at its most inviting.


def parse_base():
    block = re.search(r"const BASE: string\[\] = \[(.*?)\];", SRC, re.S).group(1)
    return re.findall(r'"([.obleamf]{16})"', block)


def parse_face(mood):
    block = re.search(mood + r": \{(.*?)\},", SRC, re.S).group(1)
    return {k: v for k, v in re.findall(r'(r\d+): "([.obleamf]{16})"', block)}


def parse_palette(mood):
    block = re.search(mood + r": \{\s*(o:.*?)\},", SRC, re.S).group(1)
    return dict(re.findall(r"(\w+): \"(#[0-9a-fA-F]{6})\"", block))


def font(size, mono=True):
    candidates = (
        ["consola.ttf", "lucon.ttf", "cour.ttf"] if mono else ["segoeui.ttf", "arial.ttf"]
    )
    for name in candidates:
        for base in ("C:/Windows/Fonts/", ""):
            try:
                return ImageFont.truetype(base + name, size)
            except OSError:
                continue
    return ImageFont.load_default()


def main():
    rows = parse_base()
    face = parse_face(MOOD)
    pal = parse_palette(MOOD)
    rows[7], rows[8], rows[9], rows[10] = face["r7"], face["r8"], face["r9"], face["r10"]

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), pal["bg1"])
    d = ImageDraw.Draw(img)

    # Vertical wash from the mood's two background tones.
    top = tuple(int(pal["bg0"][i : i + 2], 16) for i in (1, 3, 5))
    bot = tuple(int(pal["bg1"][i : i + 2], 16) for i in (1, 3, 5))
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

    # Scanlines, matching the SVG treatment.
    line = tuple(int(c * 0.10 + 255 * 0.04) for c in top)
    for y in range(0, H, 4):
        d.line([(0, y), (W, y)], fill=line)

    # Mascot, left side.
    cell = 26
    art = cell * 16
    ox, oy = 96, (H - art) // 2
    key = {
        "o": pal["o"], "b": pal["b"], "l": pal.get("l", pal["b"]),
        "e": pal["e"], "m": pal["m"], "f": pal["f"], "a": pal["a"],
    }
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            d.rectangle(
                [ox + x * cell, oy + y * cell, ox + (x + 1) * cell - 1, oy + (y + 1) * cell - 1],
                fill=key[ch],
            )

    # Copy, right side.
    tx = ox + art + 88
    d.text((tx, 214), "MOODMINT", font=font(26), fill=pal["ink"])
    d.text((tx, 268), "An NFT that", font=font(52), fill="#ffffff")
    d.text((tx, 326), "feels the market.", font=font(52), fill=pal["b"])
    d.text((tx, 408), "Redrawn live from SOL price action.", font=font(24), fill=pal["ink"])
    d.text((tx, 440), "Solana devnet.", font=font(24), fill=pal["ink"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print("wrote", OUT, img.size)


if __name__ == "__main__":
    main()
