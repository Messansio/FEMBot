"""Vercel / Geist dark palette and fonts shared by every image the bot draws (mirrors src/theme.ts)."""

import os
from functools import cache
from pathlib import Path

from PIL import ImageFont

BACKGROUND = "#000000"
SURFACE = "#0a0a0a"
RAISED = "#1a1a1a"
BORDER = "#262626"
FOREGROUND = "#ededed"
SECONDARY = "#a1a1a1"
MUTED = "#707070"
LINE_NUMBER = "#525252"

BLUE = "#47a8ff"
PURPLE = "#c472fb"
PINK = "#ff4d8d"
AMBER = "#ffb224"
GREEN = "#00ca50"
TEAL = "#0ac5b3"
RED = "#ff6166"
ERROR_BG = "#3c1618"

# Same order as laneColors in src/theme.ts, so text and image graphs match.
LANES = [BLUE, PINK, AMBER, GREEN, TEAL, RED]


def lane_color(lane: int) -> str:
    return LANES[lane % len(LANES)]


def mix(color: str, background: str, alpha: float) -> str:
    """`color` at `alpha` opacity over `background`, as hex (Pillow has no per-shape alpha)."""
    c = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(background[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * alpha + y * (1 - alpha)):02x}" for x, y in zip(c, b))



def readable(color: str, minimum: float = 0.5) -> str:
    """`color` lifted toward white until it reads on the black background (GitHub labels can be any colour)."""
    def luminance(hex_color: str) -> float:
        r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    for step in range(11):
        lifted = mix("#ffffff", color, step / 10)
        if luminance(lifted) >= minimum:
            return lifted
    return "#ffffff"

FONT_DIRS = [
    Path.home() / "Library/Fonts", Path("/Library/Fonts"), Path("/System/Library/Fonts"),
    Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), Path.home() / ".local/share/fonts",
    Path("C:/Windows/Fonts"),
]
WEIGHT_NAMES = {400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold"}


@cache
def _font_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for folder in FONT_DIRS:
        if folder.is_dir():
            for root, _, files in os.walk(folder):
                for name in files:
                    index.setdefault(name.lower(), os.path.join(root, name))
    return index


def _find(candidates: list[str]) -> str | None:
    index = _font_index()
    return next((index[c.lower()] for c in candidates if c.lower() in index), None)


@cache
def sans(size: float, weight: int = 400) -> ImageFont.FreeTypeFont:
    """Geist when installed (variable font), else the closest system sans."""
    variable = _find(["Geist[wght].ttf", "Geist-VariableFont_wght.ttf", "Inter[opsz,wght].ttf"])
    if variable:
        font = ImageFont.truetype(variable, round(size))
        try:
            axes = font.get_variation_axes()
            font.set_variation_by_axes([weight if a.get("name") in (b"Weight", "Weight") else a["default"] for a in axes])
        except OSError:
            pass
        return font
    name = WEIGHT_NAMES.get(weight, "Regular")
    path = _find([f"Geist-{name}.ttf", f"Geist-{name}.otf", f"Inter-{name}.ttf", "Helvetica.ttc",
                  "DejaVuSans-Bold.ttf" if weight >= 600 else "DejaVuSans.ttf", "arial.ttf"])
    return ImageFont.truetype(path, round(size)) if path else ImageFont.load_default(round(size))


@cache
def mono(size: float, weight: int = 400) -> ImageFont.FreeTypeFont:
    """Geist Mono when installed, else SF Mono / Menlo / DejaVu Sans Mono."""
    variable = _find(["GeistMono[wght].ttf", "GeistMono-VariableFont_wght.ttf"])
    if variable:
        font = ImageFont.truetype(variable, round(size))
        try:
            font.set_variation_by_axes([weight])
        except OSError:
            pass
        return font
    name = WEIGHT_NAMES.get(weight, "Regular")
    path = _find([f"GeistMono-{name}.otf", f"GeistMono-{name}.ttf", f"SF-Mono-{name}.otf",
                  "SF-Mono-Regular.otf", "Menlo.ttc", "DejaVuSansMono.ttf", "consola.ttf"])
    return ImageFont.truetype(path, round(size)) if path else ImageFont.load_default(round(size))
