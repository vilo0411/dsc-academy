#!/usr/bin/env python3
"""DSC Academy — static site builder.

Reads Markdown articles + YAML data from ./content, renders Jinja templates
from ./templates, copies ./static, and writes the site to ./dist.

    python build.py                 # base path /dsc-academy (GitHub Pages)
    BASE_PATH="" python build.py    # build for a domain root
"""
import json
import os
import re
import shutil
import unicodedata
from datetime import date
from pathlib import Path

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
CONTENT = ROOT / "content"
DIST = ROOT / "dist"
BASE = os.environ.get("BASE_PATH", "/dsc-academy").rstrip("/")
SITE_URL = os.environ.get("SITE_URL", "https://vilo0411.github.io").rstrip("/")

TIER_RANK = {"free": 0, "acct": 1, "ekyc": 2}
TIER_LABEL = {"free": "Miễn phí", "acct": "Cần mở tài khoản", "ekyc": "Cần eKYC"}
LEVEL_LABEL = {"basic": "Cơ bản", "mid": "Trung cấp", "adv": "Nâng cao"}


def slugify(value, separator="-"):
    value = unicodedata.normalize("NFD", str(value))
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = value.replace("đ", "d").replace("Đ", "D").lower()
    value = re.sub(r"[^a-z0-9]+", separator, value).strip(separator)
    return value


TERM_RE = re.compile(r"\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]")


def link_terms(text, glossary_keys, missing):
    def repl(m):
        label = m.group(1).strip()
        key = slugify(m.group(2) or label)
        if key not in glossary_keys:
            missing.add(key)
            return label
        return f'<button type="button" class="term" data-term="{key}" aria-expanded="false">{label}</button>'

    return TERM_RE.sub(repl, text)


def check_question(q, where):
    opts = q.get("options")
    if not isinstance(opts, list) or len(opts) < 2:
        raise ValueError(f"{where}: options must be a list of 2+ items (quote options that contain commas)")
    if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(opts):
        raise ValueError(f"{where}: answer must be an index 0..{len(opts) - 1}")


def read_md(path):
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        raise ValueError(f"{path}: missing frontmatter")
    return yaml.safe_load(m.group(1)), m.group(2)


def render_md(body, glossary_keys, missing):
    md = markdown.Markdown(
        extensions=["toc", "tables", "attr_list", "md_in_html"],
        extension_configs={"toc": {"slugify": slugify, "toc_depth": "2"}},
    )
    html = md.convert(link_terms(body, glossary_keys, missing))
    toc = [{"id": t["id"], "name": t["name"]} for t in md.toc_tokens]
    return html, toc


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(ROOT / "static", DIST)

    site = yaml.safe_load((CONTENT / "site.yaml").read_text(encoding="utf-8"))
    modules = yaml.safe_load((CONTENT / "modules.yaml").read_text(encoding="utf-8"))
    glossary = yaml.safe_load((CONTENT / "glossary.yaml").read_text(encoding="utf-8"))
    for g in glossary:
        g["key"] = slugify(g["term"])
    glossary.sort(key=lambda g: slugify(g["term"]))
    gkeys = {g["key"] for g in glossary}
    missing = set()

    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals.update(
        base=BASE, site=site, site_url=SITE_URL, tier_label=TIER_LABEL,
        level_label=LEVEL_LABEL, year=date.today().year,
    )
    env.filters["json"] = lambda v: json.dumps(v, ensure_ascii=False).replace("</", "<\\/")
    env.filters["slug"] = slugify

    pages = []

    def out(rel, template, **ctx):
        path = DIST / rel / "index.html" if rel else DIST / "index.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        ctx.setdefault("canonical", f"{BASE}/{rel}/" if rel else f"{BASE}/")
        path.write_text(env.get_template(template).render(**ctx), encoding="utf-8")
        pages.append(ctx["canonical"])

    # ---- modules & articles
    latest = []
    for mod in modules:
        mod["num"] = f"{mod['order']:02d}"
        mod["url"] = f"{BASE}/khoa-hoc/{mod['slug']}/"
        mod["articles"] = []
        mod["tiers"] = [{"f": "free", "a": "acct", "e": "ekyc"}[c] for c in mod.get("map", "")]
        folder = CONTENT / "khoa-hoc" / mod["slug"]
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.md")):
            meta, body = read_md(f)
            html, toc = render_md(body, gkeys, missing)
            a = dict(meta)
            a.setdefault("tier", "free")
            a["slug"] = a.get("slug") or slugify(a["title"])
            a["num"] = f"{a['order']:02d}"
            a["url"] = f"{mod['url']}{a['slug']}/"
            a["html"] = html
            a["toc"] = toc
            a["module"] = mod
            for i, q in enumerate(a.get("quiz", [])):
                q["id"] = f"q{i + 1}"
                check_question(q, f"{f.name} quiz {i + 1}")
            mod["articles"].append(a)
        mod["articles"].sort(key=lambda a: a["order"])
        mod["tiers"] = [a["tier"] for a in mod["articles"]]
        mod["minutes"] = sum(a.get("minutes", 0) for a in mod["articles"])
        exam_file = CONTENT / "bai-thi" / f"{mod['slug']}.yaml"
        mod["exam"] = yaml.safe_load(exam_file.read_text(encoding="utf-8")) if exam_file.exists() else None
        if mod["exam"]:
            mod["exam_url"] = f"{mod['url']}bai-thi/"
            for i, q in enumerate(mod["exam"]["questions"]):
                check_question(q, f"exam {mod['slug']} q{i + 1}")

    for mod in modules:
        arts = mod["articles"]
        if not arts:
            continue
        lite = [{"slug": a["slug"], "num": a["num"], "title": a["title"], "url": a["url"], "tier": a["tier"]} for a in arts]
        out(f"khoa-hoc/{mod['slug']}", "module.html", title=mod["title"], description=mod["desc"], mod=mod, lite=lite)
        for i, a in enumerate(arts):
            prev_a = arts[i - 1] if i > 0 else None
            next_a = arts[i + 1] if i + 1 < len(arts) else None
            out(
                f"khoa-hoc/{mod['slug']}/{a['slug']}", "article.html",
                title=a["title"], description=a.get("description", ""), mod=mod, a=a,
                prev=prev_a, next=next_a, lite=lite,
            )
        if mod["exam"]:
            out(f"khoa-hoc/{mod['slug']}/bai-thi", "exam.html", title=f"Bài thi: {mod['title']}",
                description=f"Bài thi cuối khoá {mod['title']}", mod=mod, exam=mod["exam"])
        latest.extend(arts)

    latest = sorted(latest, key=lambda a: str(a.get("updated", "")), reverse=True)[:4]

    out("", "home.html", title=site["name"], description=site["tagline"], modules=modules, latest=latest)
    out("thuat-ngu", "glossary.html", title="Thuật ngữ đầu tư", description="Giải thích các thuật ngữ tài chính, đầu tư.", glossary=glossary)
    out("dang-nhap", "login.html", title="Đăng nhập", description="Đăng nhập DSC Academy")
    out("hoc-tap", "learning.html", title="Học tập của tôi", description="Tiến độ học tập", modules=[m for m in modules if m["articles"]])
    out("quyen-loi", "access.html", title="Quyền lợi theo tài khoản", description="Nội dung miễn phí và nội dung dành cho khách hàng DSC", modules=modules)

    # glossary data for popovers
    (DIST / "data").mkdir(exist_ok=True)
    (DIST / "data" / "glossary.json").write_text(
        json.dumps({g["key"]: {"term": g["term"], "def": g["def"]} for g in glossary}, ensure_ascii=False),
        encoding="utf-8",
    )

    # 404, sitemap, robots
    (DIST / "404.html").write_text(env.get_template("404.html").render(title="Không tìm thấy trang", canonical=f"{BASE}/404.html"), encoding="utf-8")
    urls = "\n".join(f"  <url><loc>{SITE_URL}{p}</loc></url>" for p in pages)
    (DIST / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n',
        encoding="utf-8",
    )
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}{BASE}/sitemap.xml\n", encoding="utf-8")
    (DIST / ".nojekyll").write_text("", encoding="utf-8")

    if missing:
        print("WARNING: glossary terms not found:", ", ".join(sorted(missing)))
    print(f"Built {len(pages)} pages → {DIST}")


if __name__ == "__main__":
    main()
