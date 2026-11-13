"""Draws the git graph and pull request cards as PNG.

    echo '{"kind": "graph", ...}' | uv run python graphics.py > out.png

Everything is laid out in base units and drawn at 4x, then scaled to 2x for crisp,
anti-aliased lines and text (Pillow does not anti-alias shapes itself).
"""

import base64
import io
import json
import sys
import textwrap

from PIL import Image, ImageDraw

import theme
from theme import mono, sans

SUPERSAMPLE = 4
OUTPUT_SCALE = 2


class Canvas:
    def __init__(self, width: float, height: float):
        self.k = SUPERSAMPLE
        self.image = Image.new("RGB", (round(width * self.k), round(height * self.k)), theme.BACKGROUND)
        self.draw = ImageDraw.Draw(self.image)

    def s(self, *values: float):
        return [round(v * self.k) for v in values]

    def text(self, xy, text, font, fill, anchor="lm"):
        self.draw.text(self.s(*xy), text, font=font, fill=fill, anchor=anchor)

    def rect(self, box, fill=None, outline=None, radius=0, width=1):
        self.draw.rounded_rectangle(self.s(*box), radius=radius * self.k, fill=fill, outline=outline,
                                    width=max(1, round(width * self.k)))

    def circle(self, center, radius, fill=None, outline=None, width=1):
        x, y = center
        self.draw.ellipse(self.s(x - radius, y - radius, x + radius, y + radius), fill=fill,
                          outline=outline, width=max(1, round(width * self.k)))

    def line(self, points, fill, width=2):
        self.draw.line([tuple(self.s(*p)) for p in points], fill=fill, width=round(width * self.k), joint="curve")

    def avatar(self, center, radius, data: str | None, ring: str, fallback: str):
        """Round avatar with a coloured ring; a lettered dot when there is no picture."""
        x, y = center
        self.circle(center, radius + 2, fill=ring)
        if data:
            size = round(radius * 2 * self.k)
            picture = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB").resize((size, size), Image.LANCZOS)
            mask = Image.new("L", (size, size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
            self.image.paste(picture, tuple(self.s(x - radius, y - radius)), mask)
        else:
            self.circle(center, radius, fill=theme.RAISED)
            self.text(center, (fallback or "?")[:1].upper(), sans(radius * 1.1 * self.k, 600), theme.FOREGROUND, "mm")

    def png(self) -> bytes:
        width, height = self.image.size
        scale = OUTPUT_SCALE / SUPERSAMPLE
        out = io.BytesIO()
        self.image.resize((round(width * scale), round(height * scale)), Image.LANCZOS).save(out, "PNG", optimize=True)
        return out.getvalue()


def fit(text: str, font, max_width: float) -> str:
    """Truncate with an ellipsis to fit max_width (base units, font at 1x)."""
    if font.getlength(text) <= max_width:
        return text
    while text and font.getlength(text + "…") > max_width:
        text = text[:-1]
    return text.rstrip() + "…"


def pill(canvas: Canvas, x, y, text, font, color, solid=False, height=22) -> float:
    """Rounded label; returns its width. Solid = filled with the colour (black text)."""
    width = font.getlength(text) / canvas.k + 16
    fill = color if solid else theme.mix(color, theme.BACKGROUND, 0.16)
    canvas.rect((x, y - height / 2, x + width, y + height / 2), fill=fill,
                outline=None if solid else theme.mix(color, theme.BACKGROUND, 0.45), radius=6)
    canvas.text((x + 8, y), text, font, theme.BACKGROUND if solid else color)
    return width


# --- Git graph -------------------------------------------------------------------

def draw_graph(data: dict) -> bytes:
    rows, tail = data["rows"], data["tail"]
    pad, header, row_h, lane_w = 32, 76, 40, 24
    width = 1040
    graph_x = pad + 14
    text_x = graph_x + max(data["width"], 1) * lane_w + 14
    top = pad + header
    height = top + len(rows) * row_h + 24 + pad

    c = Canvas(width, height)
    k = c.k
    c.text((pad, pad + 10), data["repo"], sans(22 * k, 600), theme.FOREGROUND)
    subtitle = f"{data['branchCount']} branches  ·  last {len(rows)} commits  ·  default {data['defaultBranch']}"
    c.text((pad, pad + 40), subtitle, sans(13 * k), theme.SECONDARY)
    c.line([(pad, top - 12), (width - pad, top - 12)], theme.BORDER, 1)

    def center_y(i):
        return top + i * row_h + row_h / 2

    def lane_x(lane):
        return graph_x + lane * lane_w

    # Highlight the default branch head, like a selected row.
    for i, row in enumerate(rows):
        if data["defaultBranch"] in row["refs"]:
            c.rect((pad - 8, center_y(i) - row_h / 2 + 3, width - pad + 8, center_y(i) + row_h / 2 - 3),
                   fill=theme.mix(theme.lane_color(row["col"]), theme.BACKGROUND, 0.08), radius=8)

    def edge(x1, y1, x2, y2, color):
        if x1 == x2:
            c.line([(x1, y1), (x2, y2)], color)
            return
        # S-curve between lanes.
        points = []
        for step in range(25):
            t = step / 24
            mt = 1 - t
            cy1, cy2 = y1 + (y2 - y1) * 0.65, y2 - (y2 - y1) * 0.65
            points.append((mt ** 3 * x1 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t ** 3 * x2,
                           mt ** 3 * y1 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t ** 3 * y2))
        c.line(points, color)

    for i, row in enumerate(rows):
        y_prev = center_y(i - 1) if i else top - 6
        for e in row["above"]:
            edge(lane_x(e["from"]), y_prev, lane_x(e["to"]), center_y(i), theme.lane_color(e["color"]))
    if rows:
        last = center_y(len(rows) - 1)
        for e in tail:
            edge(lane_x(e["from"]), last, lane_x(e["to"]), last + row_h * 0.9, theme.mix(theme.lane_color(e["color"]), theme.BACKGROUND, 0.5))

    right_cols = (150, 74, 70)  # author, sha, date
    message_end = width - pad - sum(right_cols) - 12
    for i, row in enumerate(rows):
        y = center_y(i)
        color = theme.lane_color(row["col"])
        if row["merge"]:
            c.circle((lane_x(row["col"]), y), 6, fill=theme.BACKGROUND, outline=color, width=2.5)
        else:
            c.avatar((lane_x(row["col"]), y), 9, row.get("avatar"), color, row["author"])

        x = text_x
        for ref in row["refs"][:3]:
            is_default = ref == data["defaultBranch"]
            x += pill(c, x, y, ref, mono(12 * k, 500), theme.GREEN if is_default else color, solid=is_default) + 6
        if len(row["refs"]) > 3:
            x += pill(c, x, y, f"+{len(row['refs']) - 3}", mono(12 * k, 500), theme.SECONDARY) + 6
        message_font = sans(14 * k, 500 if row["refs"] else 400)
        c.text((x + 4, y), fit(row["message"], message_font, (message_end - x - 4) * k),
               message_font, theme.FOREGROUND if row["refs"] else theme.mix(theme.FOREGROUND, theme.BACKGROUND, 0.82))

        rx = message_end + 12
        c.text((rx, y), fit(row["author"], sans(13 * k), (right_cols[0] - 12) * k), sans(13 * k), theme.SECONDARY)
        c.text((rx + right_cols[0], y), row["sha"], mono(12 * k), theme.MUTED)
        c.text((width - pad, y), row["date"], sans(13 * k), theme.MUTED, "rm")

    return c.png()


# --- Pull request card -------------------------------------------------------------

STATES = {
    "open": ("Open", theme.GREEN),
    "draft": ("Draft", theme.SECONDARY),
    "merged": ("Merged", theme.PURPLE),
    "closed": ("Closed", theme.RED),
}


def draw_pull(data: dict) -> bytes:
    pad, width = 40, 920
    commits = data["commits"][:12]
    title_lines = textwrap.wrap(data["title"], 52)[:2] or [""]
    labels = data.get("labels", [])[:6]
    height = (pad + 26 + len(title_lines) * 36 + 16 + 36 + 34 + (36 if labels else 0) + 28 + 36
              + len(commits) * 56 + (32 if len(data["commits"]) > 12 else 0) + pad)

    c = Canvas(width, height)
    k = c.k
    y = pad + 8
    c.text((pad, y), data["repo"], mono(13 * k), theme.SECONDARY)
    c.text((width - pad, y), f"#{data['number']}", mono(13 * k, 500), theme.SECONDARY, "rm")
    y += 30
    for line in title_lines:
        c.text((pad, y + 14), line, sans(28 * k, 600), theme.FOREGROUND)
        y += 36
    y += 16

    label, color = STATES[data["state"]]
    x = pad + pill(c, pad, y, f"●  {label}", sans(13 * k, 600), color, solid=True, height=28) + 14
    c.avatar((x + 10, y), 10, data["author"].get("avatar"), theme.BORDER, data["author"]["login"])
    x += 28
    for part, font, fill in (
        (data["author"]["login"], sans(14 * k, 600), theme.FOREGROUND),
        (f"wants to merge {data['commitsCount']} commit{'s' if data['commitsCount'] != 1 else ''} into", sans(14 * k), theme.SECONDARY),
    ):
        c.text((x, y), part, font, fill)
        x += font.getlength(part) / k + 6
    x += pill(c, x, y, data["base"], mono(12 * k, 500), theme.BLUE) + 6
    c.text((x, y), "from", sans(14 * k), theme.SECONDARY)
    x += sans(14 * k).getlength("from") / k + 6
    pill(c, x, y, fit(data["head"], mono(12 * k, 500), (width - pad - x - 16) * k), mono(12 * k, 500), theme.BLUE)
    y += 36

    x = pad
    for part, fill in ((f"+{data['additions']}", theme.GREEN), (f"−{data['deletions']}", theme.RED)):
        c.text((x, y), part, mono(14 * k, 600), fill)
        x += mono(14 * k, 600).getlength(part) / k + 10
    total = data["additions"] + data["deletions"]
    green = round(5 * data["additions"] / total) if total else 0
    for i in range(5):
        fill = theme.GREEN if i < green else theme.RED if total else theme.BORDER
        c.rect((x, y - 5, x + 10, y + 5), fill=fill, radius=2)
        x += 13
    def count(n, word):
        return f"{n} {word}{'' if n == 1 else 's'}"

    meta = (f"{count(data['changedFiles'], 'file')}  ·  {count(data['commitsCount'], 'commit')}  ·  "
            f"{count(data['comments'], 'comment')}  ·  opened {data['created']}  ·  updated {data['updated']}")
    c.text((x + 10, y), meta, sans(13 * k), theme.SECONDARY)
    y += 34

    if labels:
        x = pad
        for item in labels:
            x += pill(c, x, y, item["name"], sans(12 * k, 500), "#" + item["color"]) + 6
        y += 36

    c.line([(pad, y), (width - pad, y)], theme.BORDER, 1)
    y += 28
    c.text((pad, y), "COMMITS", sans(12 * k, 600), theme.MUTED)
    y += 36

    timeline_x = pad + 14
    if len(commits) > 1:
        c.line([(timeline_x, y), (timeline_x, y + (len(commits) - 1) * 56)], theme.BORDER, 2)
    for commit in commits:
        c.avatar((timeline_x, y), 14, commit.get("avatar"), theme.BACKGROUND, commit["author"])
        text_x = timeline_x + 30
        sha_w = 84
        c.text((text_x, y - 9), fit(commit["message"], sans(15 * k, 500), (width - pad - text_x - sha_w - 12) * k),
               sans(15 * k, 500), theme.FOREGROUND)
        who = commit["author"] + (f"  @{commit['login']}" if commit.get("login") else "")
        c.text((text_x, y + 11), f"{who}  ·  {commit['date']}", sans(12 * k), theme.SECONDARY)
        c.rect((width - pad - sha_w + 8, y - 12, width - pad, y + 12), outline=theme.BORDER, radius=6)
        c.text((width - pad - (sha_w - 8) / 2, y), commit["sha"], mono(12 * k), theme.SECONDARY, "mm")
        y += 56
    if len(data["commits"]) > 12:
        c.text((timeline_x + 30, y - 16), f"+ {len(data['commits']) - 12} more commits", sans(13 * k), theme.MUTED)

    return c.png()


def main() -> None:
    data = json.load(sys.stdin)
    png = {"graph": draw_graph, "pull": draw_pull}[data["kind"]](data)
    sys.stdout.buffer.write(png)


if __name__ == "__main__":
    main()
