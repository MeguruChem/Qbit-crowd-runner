"""index.html の <script src> をインライン化して dist/index.html（単一ファイル）を作る。"""
import pathlib
import re

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")


def inline(m: re.Match) -> str:
    src = (root / m.group(1)).read_text(encoding="utf-8")
    return "<script>\n" + src + "\n</script>"


out = re.sub(r'<script src="([^"]+)"></script>', inline, html)
(root / "dist").mkdir(exist_ok=True)
(root / "dist" / "index.html").write_text(out, encoding="utf-8")
print("wrote dist/index.html", len(out), "bytes")
