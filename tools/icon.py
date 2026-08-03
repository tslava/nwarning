#!/usr/bin/env python3
"""Draw the extension's icons.

    python3 tools/icon.py

Writes `src/shared/images/icon_{16x16,48x48,128x128}.png`. The PNGs are generated,
not drawn by hand — edit this file rather than the images, or the next run silently
reverts your change.

The icon is a circle split down the middle: green for a non-production stand, red
for production, in exactly the colours the banner uses, so the icon and the thing it
stands for say the same thing.

Two details matter more than they look:

  * The halves and the gap are drawn at the target size with whole-pixel
    coordinates, while only the circle's outline comes from a supersampled mask.
    Drawing everything large and scaling down puts the gap's edges inside pixels,
    and at 16px a 2px white gap then resolves as two grey ones — the icon looks
    smudged rather than crisp. This way the gap is pure white and the outline is
    still smooth.

  * The gap is at least 2px wide at every size. Below that it disappears into the
    rounding and the two halves read as one bicoloured blob.
"""

from pathlib import Path
from PIL import Image, ImageDraw

# The banner's own colours: src/shared/css/content.css.
PRODUCTION = (255, 68, 68, 255)
DEVELOPMENT = (23, 180, 23, 255)
WHITE = (255, 255, 255, 255)

SIZES = (16, 48, 128)
OUTPUT = Path(__file__).resolve().parent.parent / 'src' / 'shared' / 'images'

# How much of the width the gap takes, and the floor that keeps it visible at 16px.
GAP_FRACTION = 0.10
MIN_GAP_PX = 2
# Inset from the edge. Small: a circle needs no padding of its own, and at 16px
# every pixel of diameter is one the toolbar can show.
MARGIN_FRACTION = 0.02
SUPERSAMPLE = 8


def draw_icon(size: int) -> Image.Image:
    icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)

    middle = size // 2
    draw.rectangle([0, 0, middle - 1, size], fill=DEVELOPMENT)
    draw.rectangle([middle, 0, size, size], fill=PRODUCTION)

    gap = max(MIN_GAP_PX, round(size * GAP_FRACTION))
    # Centred on the seam, and kept even so it splits equally between the halves.
    gap += gap % 2
    draw.rectangle([middle - gap // 2, 0, middle + gap // 2 - 1, size], fill=WHITE)

    icon.putalpha(circle_alpha(size))
    return icon


def circle_alpha(size: int) -> Image.Image:
    """A smooth circular edge, from a mask drawn large and scaled down."""
    big = size * SUPERSAMPLE
    mask = Image.new('L', (big, big), 0)
    inset = big * MARGIN_FRACTION
    ImageDraw.Draw(mask).ellipse([inset, inset, big - inset - 1, big - inset - 1], fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def main() -> None:
    for size in SIZES:
        path = OUTPUT / f'icon_{size}x{size}.png'
        draw_icon(size).save(path)
        print(f'wrote {path.relative_to(OUTPUT.parents[3])} ({size}x{size})')


if __name__ == '__main__':
    main()
