#!/usr/bin/env python3
"""
Bundle the app into one self-contained HTML file.

    python3 build.py

Reads index.html, inlines every local stylesheet (<link rel="stylesheet" href="...">)
and script (<script src="..."></script>), and writes dist/mtg-booster-generator.html.
Only the Python standard library is needed. Remote libraries the app loads on demand
(pdf-lib and sql.js from jsDelivr) are left as they are.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "index.html"
OUTPUT = ROOT / "dist" / "mtg-booster-generator.html"

STYLESHEET = re.compile(r'<link rel="stylesheet" href="(?!https?:)([^"]+)">')
SCRIPT = re.compile(r'<script src="(?!https?:)([^"]+)"></script>')


def read(rel_path: str) -> str:
    path = (ROOT / rel_path).resolve()
    if ROOT not in path.parents:
        raise SystemExit(f"Refusing to inline a file outside the project: {rel_path}")
    return path.read_text(encoding="utf-8")


def inline_style(match: re.Match) -> str:
    css = read(match.group(1))
    return f"<style>\n/* {match.group(1)} */\n{css}</style>"


def inline_script(match: re.Match) -> str:
    js = read(match.group(1)).replace("</script", "<\\/script")
    return f"<script>\n/* {match.group(1)} */\n{js}</script>"


def main() -> None:
    html = SOURCE.read_text(encoding="utf-8")
    html, styles = STYLESHEET.subn(inline_style, html)
    html, scripts = SCRIPT.subn(inline_script, html)
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    size = OUTPUT.stat().st_size / 1024
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({size:.0f} KB): {styles} stylesheet(s), {scripts} script(s) inlined")


if __name__ == "__main__":
    main()
