#!/usr/bin/env python3
"""Draw the Chrome Web Store promotional tiles.

    python3 tools/promo.py

Writes `store/promo-small-440x280.png` and `store/promo-marquee-1400x560.png`.
The small tile is required to submit a Chrome listing; the marquee one is optional
and only shown if the item is featured.

These are store assets, not extension assets, so they live outside `src/` and are
never packaged. The icon is reused from `tools/icon.py` rather than redrawn, so the
tile cannot drift from the icon or from the banner's colours.

Store guidance is to keep tiles nearly text-free — no screenshots, no feature lists,
just the mark and the name. Anything smaller than the name is unreadable at the size
these are actually displayed.
"""

from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icon import draw_icon, PRODUCTION, DEVELOPMENT  # noqa: E402

OUTPUT = Path(__file__).resolve().parent.parent / 'store'

INK = (31, 41, 55, 255)
MUTED = (107, 114, 128, 255)
BACKGROUND = (255, 255, 255, 255)

NAME = 'Environment Switcher'
TAGLINE = 'Red means production'

# macOS ships these; the first that exists wins. Without a real font Pillow falls
# back to a bitmap face that looks broken at this size.
FONT_CANDIDATES = [
    ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'),
    ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Helvetica.ttc'),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
]


def fonts(bold_size, regular_size):
    for bold_path, regular_path in FONT_CANDIDATES:
        if Path(bold_path).exists() and Path(regular_path).exists():
            return (
                ImageFont.truetype(bold_path, bold_size),
                ImageFont.truetype(regular_path, regular_size),
            )
    raise SystemExit('no usable system font found; edit FONT_CANDIDATES')


def tile(width, height, icon_size, name_size, tagline_size, gap, margin):
    tile = Image.new('RGBA', (width, height), BACKGROUND)
    draw = ImageDraw.Draw(tile)
    icon = draw_icon(icon_size)

    # Shrink the type until the whole block fits, rather than trusting a size that
    # happens to suit this particular name: "Environment Switcher" at the size that
    # looks right on the marquee runs off the edge of the small tile.
    available = width - 2 * margin - icon_size - gap
    while True:
        bold, regular = fonts(name_size, tagline_size)
        name_box = draw.textbbox((0, 0), NAME, font=bold)
        tagline_box = draw.textbbox((0, 0), TAGLINE, font=regular)
        text_width = max(name_box[2] - name_box[0], tagline_box[2] - tagline_box[0])
        if text_width <= available or name_size <= 10:
            break
        name_size -= 1
        tagline_size = max(10, round(name_size * 0.56))

    block_width = icon_size + gap + text_width
    left = (width - block_width) // 2

    tile.alpha_composite(icon, (left, (height - icon_size) // 2))

    text_left = left + icon_size + gap
    name_height = name_box[3] - name_box[1]
    tagline_height = tagline_box[3] - tagline_box[1]
    spacing = max(8, tagline_size // 2)
    total = name_height + spacing + tagline_height
    top = (height - total) // 2

    draw.text((text_left, top - name_box[1]), NAME, font=bold, fill=INK)
    draw.text(
        (text_left, top + name_height + spacing - tagline_box[1]),
        TAGLINE,
        font=regular,
        fill=MUTED,
    )

    # A hairline in the two colours, tying the tile to the banner without spelling
    # it out. Production on the right, as in the icon.
    bar = max(4, height // 70)
    draw.rectangle([0, height - bar, width // 2, height], fill=DEVELOPMENT)
    draw.rectangle([width // 2, height - bar, width, height], fill=PRODUCTION)

    return tile


def main():
    OUTPUT.mkdir(exist_ok=True)

    small = tile(440, 280, icon_size=96, name_size=30, tagline_size=17, gap=20, margin=24)
    small.save(OUTPUT / 'promo-small-440x280.png')

    marquee = tile(1400, 560, icon_size=248, name_size=84, tagline_size=42, gap=56, margin=72)
    marquee.save(OUTPUT / 'promo-marquee-1400x560.png')

    for path in sorted(OUTPUT.glob('promo-*.png')):
        print(f'wrote {path.relative_to(OUTPUT.parent)} {Image.open(path).size}')


if __name__ == '__main__':
    main()
