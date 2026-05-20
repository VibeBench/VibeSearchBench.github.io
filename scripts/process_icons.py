#!/usr/bin/env python3
"""Strip baked-in backgrounds from logo assets and write clean PNGs."""

from __future__ import annotations

import colorsys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "img"
PAGE_BG = (250, 250, 250, 255)  # --bg #fafafa


def luminance(r: int, g: int, b: int) -> float:
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_background(r: int, g: int, b: int, a: int) -> bool:
    if a == 0:
        return True
    _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    lum = luminance(r, g, b)
    # black / near-black matte
    if lum < 32:
        return True
    # white, light gray, checkerboard (#ccc / #fff)
    if v >= 0.72 and s <= 0.16:
        return True
    if lum > 228 and max(r, g, b) - min(r, g, b) < 22:
        return True
    return False


def flood_background(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not seen[x][y]:
            r, g, b, a = px[x, y]
            if is_background(r, g, b, a):
                seen[x][y] = True
                q.append((x, y))

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny]:
                nr, ng, nb, na = px[nx, ny]
                if is_background(nr, ng, nb, na):
                    seen[nx][ny] = True
                    q.append((nx, ny))

    return im


def flood_from_transparent(im: Image.Image) -> Image.Image:
    """Remove interior matte pockets surrounded by artwork."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in range(h):
            if px[x, y][3] == 0:
                seen[x][y] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny]:
                r, g, b, a = px[nx, ny]
                if is_background(r, g, b, a):
                    seen[nx][ny] = True
                    px[nx, ny] = (r, g, b, 0)
                    q.append((nx, ny))

    return im


def trim_square(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    im = im.crop((x0, y0, x1, y1))
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return sq


def composite_on_page(im: Image.Image) -> Image.Image:
    base = Image.new("RGBA", im.size, PAGE_BG)
    base.paste(im, (0, 0), im)
    return base.convert("RGB")


def process(path: Path) -> Image.Image:
    im = Image.open(path)
    im = flood_background(im)
    im = flood_from_transparent(im)
    return trim_square(im)


def main() -> None:
    small_src = IMG / "smallicon.png"
    logo_src = IMG / "logo.png"

    emblem = process(small_src)
    emblem.save(small_src, optimize=True)

    logo = process(logo_src)
    logo.save(logo_src, optimize=True)

    composite_on_page(logo).save(IMG / "logo-hero.png", optimize=True)

    print("wrote", small_src, emblem.size, emblem.mode)
    print("wrote", logo_src, logo.size, logo.mode)
    print("wrote", IMG / "logo-hero.png")


if __name__ == "__main__":
    main()
