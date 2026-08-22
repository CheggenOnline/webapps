#!/usr/bin/env python3
"""Regenerate the launcher PNG icons.

The SVG at icons/icon.svg is the source of truth for the artwork; this script
reproduces it as PNGs because iOS cannot use SVG for a home-screen icon
(apple-touch-icon must be PNG). See CONVENTIONS.md section 10.

Usage:  python3 tools/make-icons.py        (run from the repo root)
Needs:  pip install pillow --break-system-packages
Writes: icons/icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png
"""

from PIL import Image, ImageDraw

C1 = (46, 96, 214)    # #2e60d6 blue      -- keep in sync with icons/icon.svg
C2 = (124, 58, 210)   # #7c3ad2 violet


def gradient(size, c1, c2):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        d.line([(0, y), (size, y)], fill=tuple(
            round(a + (b - a) * t) for a, b in zip(c1, c2)))
    return img


def four_tiles(img, size, pad_ratio):
    """The 2x2 launcher glyph. pad_ratio is the margin as a fraction of size."""
    d = ImageDraw.Draw(img, "RGBA")
    pad = size * pad_ratio
    inner = size - 2 * pad
    gap = inner * 0.10
    cell = (inner - gap) / 2
    radius = cell * 0.26
    for cx, cy, alpha in [(0, 0, 255), (1, 0, 205), (0, 1, 205), (1, 1, 255)]:
        x0 = pad + cx * (cell + gap)
        y0 = pad + cy * (cell + gap)
        d.rounded_rectangle([x0, y0, x0 + cell, y0 + cell],
                            radius=radius, fill=(255, 255, 255, alpha))
    return img


def round_corners(img, size, radius_ratio=0.225):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=size * radius_ratio, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img.convert("RGBA"), (0, 0), mask)
    return out


def main():
    # Standard icons: rounded corners, normal padding.
    for size in (180, 192, 512):
        art = four_tiles(gradient(size, C1, C2), size, 0.215)
        round_corners(art, size).save(f"icons/icon-{size}.png")

    # Maskable: full-bleed square with a generous safe area, since the platform
    # crops it to whatever shape it likes.
    size = 512
    art = four_tiles(gradient(size, C1, C2), size, 0.295)
    art.convert("RGBA").save("icons/icon-maskable-512.png")

    print("wrote icons/icon-180.png icon-192.png icon-512.png icon-maskable-512.png")


if __name__ == "__main__":
    main()
