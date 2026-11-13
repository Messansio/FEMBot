"""Long-lived code-review worker: one JSON request per stdin line, one JSON reply per stdout line."""

import base64
import io
import json
import os
import sys

# Libraries may print to stdout; keep the real stdout for the JSON protocol only.
protocol_out = sys.stdout
sys.stdout = sys.stderr

import torch  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from pygments import highlight  # noqa: E402
from pygments.formatters import ImageFormatter  # noqa: E402
from pygments.lexers import get_lexer_by_name, get_lexer_for_filename  # noqa: E402
from pygments.style import Style  # noqa: E402
from pygments.token import (  # noqa: E402
    Comment, Error, Keyword, Name, Number, Operator, Punctuation, String, Token,
)
from pygments.util import ClassNotFound  # noqa: E402
from transformers import AutoModel  # noqa: E402

MODEL_ID = os.environ.get("REVIEW_MODEL", "LiquidAI/d1-2B")
ERROR_THRESHOLD = float(os.environ.get("REVIEW_THRESHOLD", "0.8"))
MAX_LINES = 300  # shortcut: one question per line shares the context window, raise after testing longer files

# Keys are Pygments lexer aliases, so the model's choice is also the highlighter.
LANGUAGES = {
    "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
    "java": "Java", "c": "C", "cpp": "C++", "csharp": "C#", "go": "Go",
    "rust": "Rust", "php": "PHP", "ruby": "Ruby", "kotlin": "Kotlin",
    "swift": "Swift", "lua": "Lua", "bash": "Bash / shell", "sql": "SQL",
    "html": "HTML", "css": "CSS", "json": "JSON", "yaml": "YAML",
}

# Vercel / Geist dark palette.
BACKGROUND = "#000000"
LINE_NUMBER = "#525252"
ERROR_BG = "#3c1618"
ERROR_BAR = "#ff6166"


class VercelStyle(Style):
    background_color = BACKGROUND
    styles = {
        Token: "#ededed",  # base colour, otherwise unstyled names render black
        Comment: "#a1a1a1",
        Keyword: "#ff4d8d",
        Keyword.Constant: "#47a8ff",
        Name.Function: "#c472fb",
        Name.Class: "#c472fb",
        Name.Builtin: "#47a8ff",
        Name.Decorator: "#c472fb",
        Name.Tag: "#ff4d8d",
        Name.Attribute: "#c472fb",
        String: "#00ca50",
        Number: "#47a8ff",
        Operator: "#ededed",
        Punctuation: "#a1a1a1",
        Error: "#ff6166",
    }


def detect_language(model, code: str, filename: str | None) -> str:
    if filename:
        try:
            return get_lexer_for_filename(filename, code).aliases[0]
        except ClassNotFound:
            pass
    answer = model.system_one(code, {"language": {
        "type": "choice",
        "instructions": "Which programming language is this code written in?",
        "criteria": LANGUAGES,
    }})["answers"]["language"]
    return answer["choice"]


def find_error_lines(model, lines: list[str]) -> list[int]:
    # One pass: the whole numbered program is the state, one yes/no question per line.
    state = "\n".join(f"{n}: {line}" for n, line in enumerate(lines, 1))
    questions = {
        f"line_{n}": {
            "type": "noul",
            "instructions": (
                f"Line {n} is `{line.strip()}`. Will this line fail to compile, crash at runtime, "
                "or behave incorrectly? Check syntax (missing colons, brackets, parentheses), names "
                "that are misspelled or never defined, assignments used where a comparison is meant, "
                "and values used with the wrong type. A line that is valid and does what it intends "
                "is correct."
            ),
            "criteria": {"true": "the line has a bug", "false": "the line is correct"},
        }
        for n, line in enumerate(lines, 1)
        if line.strip()
    }
    if not questions:
        return []
    answers = model.system_one(state, questions)["answers"]
    return sorted(
        int(name.removeprefix("line_"))
        for name, answer in answers.items()
        if p_yes(answer) >= ERROR_THRESHOLD
    )


def p_yes(answer) -> float:
    return float(answer["noul"] if isinstance(answer, dict) else answer)


def render(code: str, language: str, error_lines: list[int]) -> bytes:
    try:
        lexer = get_lexer_by_name(language)
    except ClassNotFound:
        lexer = get_lexer_by_name("text")
    options = dict(
        style=VercelStyle, line_numbers=True, line_number_bg=BACKGROUND,
        line_number_fg=LINE_NUMBER, line_number_separator=False, line_number_pad=12,
        font_size=18, line_pad=6, image_pad=24, hl_lines=error_lines, hl_color=ERROR_BG,
    )
    if sys.platform == "darwin":
        options["font_name"] = "Menlo"
    formatter = ImageFormatter(**options)
    image = Image.open(io.BytesIO(highlight(code, lexer, formatter))).convert("RGB")

    # Red bar on the left of every flagged line, on top of Pygments' row tint.
    draw = ImageDraw.Draw(image)
    height = formatter._get_line_height()
    for n in error_lines:
        y = formatter._get_line_y(n - 1)
        draw.rectangle([0, y, 3, y + height - 1], fill=ERROR_BAR)

    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def review(model, request: dict) -> dict:
    code = request["code"].replace("\r\n", "\n").expandtabs(4).rstrip("\n")
    lines = code.split("\n")
    if len(lines) > MAX_LINES:
        raise ValueError(f"Code is too long: {len(lines)} lines (max {MAX_LINES}).")
    language = detect_language(model, code, request.get("filename"))
    error_lines = find_error_lines(model, lines)
    return {
        "language": LANGUAGES.get(language, language),
        "errorLines": error_lines,
        "image": base64.b64encode(render(code, language, error_lines)).decode(),
    }


def reply(message: dict) -> None:
    protocol_out.write(json.dumps(message) + "\n")
    protocol_out.flush()


def main() -> None:
    torch.set_num_threads(os.cpu_count() or 4)
    model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True, dtype=torch.float32).to("cpu")
    model.eval()
    reply({"ready": True})
    for raw in sys.stdin:
        request = json.loads(raw)
        try:
            with torch.inference_mode():
                reply({"id": request["id"], **review(model, request)})
        except Exception as error:  # report per request, keep serving
            reply({"id": request["id"], "error": str(error)})


if __name__ == "__main__":
    main()
