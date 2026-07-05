import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
STATIC = ROOT / "static"
TEMPLATES = ROOT / "templates"


def render_template(name, output_name):
    html = (TEMPLATES / name).read_text(encoding="utf-8")
    html = re.sub(
        r"\{\{\s*url_for\('static', filename='([^']*)'\)\s*\}\}",
        r"static/\1",
        html,
    )
    html = html.replace('href="/"', 'href="index.html"')
    html = html.replace('href="/map"', 'href="map.html"')
    (SITE / output_name).write_text(html, encoding="utf-8")


def main():
    if SITE.resolve().parent != ROOT.resolve():
        raise RuntimeError(f"Refusing to write outside project root: {SITE}")

    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir(parents=True)
    shutil.copytree(STATIC, SITE / "static")
    (SITE / ".nojekyll").write_text("", encoding="utf-8")
    render_template("index.html", "index.html")
    render_template("map.html", "map.html")


if __name__ == "__main__":
    main()
