#!/usr/bin/env python3
"""Generate SaMi's task-and-route launcher icon assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
SCALE = 3
WIDTH = HEIGHT = SIZE * SCALE
NAVY = (10, 26, 64)
BLUE = (53, 104, 245)
TEAL = (41, 202, 158)
WHITE = (255, 255, 255)
INK = (22, 38, 81)

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps" / "mobile" / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

def px(value):
    return int(round(value * SCALE))

def draw_symbol(canvas, with_shadow=True):
    if with_shadow:
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle((px(252), px(212), px(690), px(731)), radius=px(60), fill=(0, 0, 0, 58))
        shadow = shadow.filter(ImageFilter.GaussianBlur(px(18)))
        canvas.alpha_composite(shadow)

    draw = ImageDraw.Draw(canvas)
    # A task card with a finished task and two pending tasks.
    draw.rounded_rectangle((px(245), px(194), px(676), px(704)), radius=px(56), fill=WHITE)
    draw.rounded_rectangle((px(365), px(166), px(558), px(230)), radius=px(24), fill=BLUE)
    draw.rounded_rectangle((px(309), px(275), px(505), px(295)), radius=px(10), fill=(220, 229, 244))
    draw.rounded_rectangle((px(309), px(310), px(438), px(325)), radius=px(7), fill=(232, 238, 249))

    draw.rounded_rectangle((px(307), px(365), px(376), px(434)), radius=px(18), fill=BLUE)
    draw.line([(px(323), px(400)), (px(341), px(416)), (px(362), px(385))], fill=WHITE, width=px(9), joint="curve")
    draw.rounded_rectangle((px(405), px(382), px(606), px(397)), radius=px(8), fill=INK)
    draw.rounded_rectangle((px(405), px(409), px(553), px(421)), radius=px(6), fill=(218, 227, 242))

    draw.rounded_rectangle((px(310), px(468), px(372), px(530)), radius=px(17), outline=(177, 192, 219), width=px(6))
    draw.rounded_rectangle((px(405), px(477), px(594), px(492)), radius=px(8), fill=INK)
    draw.rounded_rectangle((px(405), px(505), px(548), px(517)), radius=px(6), fill=(218, 227, 242))

    draw.rounded_rectangle((px(310), px(564), px(372), px(626)), radius=px(17), outline=(177, 192, 219), width=px(6))
    draw.rounded_rectangle((px(405), px(575), px(569), px(590)), radius=px(8), fill=INK)
    draw.rounded_rectangle((px(405), px(602), px(520), px(614)), radius=px(6), fill=(218, 227, 242))

    # A clear route connects the job list to a location pin.
    start, c1, c2, end = (620, 650), (660, 674), (680, 716), (736, 715)
    points = []
    for i in range(31):
        t = i / 30
        u = 1 - t
        x = u*u*u*start[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*end[0]
        y = u*u*u*start[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*end[1]
        points.append((px(x), px(y)))
    draw.line(points, fill=BLUE, width=px(18), joint="curve")
    draw.polygon([(px(704), px(704)), (px(808), px(704)), (px(756), px(792))], fill=TEAL)
    draw.ellipse((px(688), px(630), px(824), px(766)), fill=TEAL)
    draw.ellipse((px(736), px(678), px(776), px(718)), fill=WHITE)

def make_launcher_icon():
    background = Image.new("RGBA", (WIDTH, HEIGHT), NAVY + (255,))
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((px(80), px(60), px(950), px(930)), fill=BLUE + (45,))
    glow = glow.filter(ImageFilter.GaussianBlur(px(170)))
    background.alpha_composite(glow)
    symbol = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_symbol(symbol, with_shadow=True)
    background.alpha_composite(symbol)
    background.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(ASSETS / "icon.png", "PNG", optimize=True)

def make_adaptive_foreground():
    foreground = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_symbol(foreground, with_shadow=False)
    foreground.resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(ASSETS / "adaptive-icon.png", "PNG", optimize=True)

if __name__ == "__main__":
    make_launcher_icon()
    make_adaptive_foreground()
    for name in ("icon.png", "adaptive-icon.png"):
        image = Image.open(ASSETS / name)
        if image.size != (SIZE, SIZE):
            raise SystemExit(f"{name} is not 1024x1024")
        print(f"Generated {name}: {image.size[0]}x{image.size[1]}, {image.mode}, {image.width * image.height} pixels")
