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


INK, WHITE = "#272d2b", "#ffffff"
LAYOUTS = {
    1: {"a": (60, 0, 60, 60), "b": (60, 60, 30, 30), "c": (90, 60, 30, 30), "g": (30, 90)},
    2: {"a": (0, 0, 120, 40), "b": (80, 40, 40, 40), "c": (80, 80, 40, 40), "g": (40, 82)},
    3: {"a": (0, 0, 40, 120), "b": (80, 0, 40, 40), "c": (40, 0, 40, 40), "g": (80, 84)},
    4: {"a": (0, 80, 120, 40), "b": (0, 0, 40, 40), "c": (80, 0, 40, 40), "g": (60, 60)},
}


def _lum(hex_):
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def glyph_color(bg):
    return INK if _lum(bg) > 0.18 else WHITE


def glyph_size(glyph):
    return {1: 46, 2: 38}.get(len(glyph), 30)


def badge_svg(art):
    L = LAYOUTS[art.get("layout", 1)]
    rects = "".join(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{art[k]}"/>'
        for k in ("a", "b", "c") for (x, y, w, h) in [L[k]]
    )
    gx, gy = L["g"]
    g = art["glyph"]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'
        f'<rect width="120" height="120" fill="{art["bg"]}"/>{rects}'
        f'<text x="{gx}" y="{gy}" text-anchor="middle" dominant-baseline="central" '
        f'font-family="Plus Jakarta Sans, DejaVu Sans, Arial, sans-serif" font-weight="700" '
        f'font-size="{glyph_size(g)}" fill="{glyph_color(art["bg"])}">{g}</text>'
        f'<rect x="1.5" y="1.5" width="117" height="117" fill="none" stroke="{INK}" stroke-width="3"/></svg>'
    )


def badge_og_png(badge, path):
    from PIL import Image, ImageDraw, ImageFont
    fonts = ROOT / "assets-build"
    bold = lambda s: ImageFont.truetype(str(fonts / "DejaVuSans-Bold.ttf"), s)
    reg = lambda s: ImageFont.truetype(str(fonts / "DejaVuSans.ttf"), s)
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(im)
    art, L = badge["art"], LAYOUTS[badge["art"].get("layout", 1)]
    s, ox, oy = 3.6, 96, 99
    d.rectangle([ox, oy, ox + 120 * s, oy + 120 * s], fill=art["bg"])
    for k in ("a", "b", "c"):
        x, y, w, h = L[k]
        d.rectangle([ox + x * s, oy + y * s, ox + (x + w) * s - 1, oy + (y + h) * s - 1], fill=art[k])
    gx, gy = L["g"]
    d.text((ox + gx * s, oy + gy * s), art["glyph"], font=bold(int(glyph_size(art["glyph"]) * s * 0.92)),
           fill=glyph_color(art["bg"]), anchor="mm")
    d.rectangle([ox, oy, ox + 120 * s, oy + 120 * s], outline=INK, width=8)
    tx = 600
    d.rectangle([0, H - 16, W, H], fill="#2ad03d")
    d.text((tx, 150), "HUY HIỆU DSC ACADEMY", font=bold(26), fill="#1d4130")
    name, y = badge["name"], 200
    for line in _wrap(d, name, bold(64), W - tx - 64):
        d.text((tx, y), line, font=bold(64), fill=INK)
        y += 76
    y += 16
    for line in _wrap(d, badge["desc"], reg(30), W - tx - 64):
        d.text((tx, y), line, font=reg(30), fill=INK)
        y += 42
    d.text((tx, H - 90), "Học đầu tư bài bản cùng DSC Academy", font=reg(24), fill="#1d4130")
    im.save(path, optimize=True)


def _wrap(d, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def mp4_duration(path):
    """Read duration (seconds) from the MP4 'mvhd' box, no external tools."""
    data = path.read_bytes()[:4_000_000] if path.stat().st_size > 4_000_000 else path.read_bytes()
    i = data.find(b"mvhd")
    if i < 0:
        data = path.read_bytes()
        i = data.find(b"mvhd")
        if i < 0:
            return None
    v = data[i + 4]
    if v == 1:
        scale = int.from_bytes(data[i + 24:i + 28], "big")
        dur = int.from_bytes(data[i + 28:i + 36], "big")
    else:
        scale = int.from_bytes(data[i + 16:i + 20], "big")
        dur = int.from_bytes(data[i + 20:i + 24], "big")
    return dur / scale if scale else None


def _cover_font(size, weight=700):
    """Plus Jakarta Sans (design system) if present in assets-build/, else Inter, else DejaVu."""
    from PIL import ImageFont
    # static instances made in CI: assets-build/PlusJakartaSans-<weight>.ttf
    w = 800 if weight >= 800 else 700 if weight >= 700 else 600
    pj = ROOT / "assets-build" / f"PlusJakartaSans-{w}.ttf"
    if pj.exists():
        return ImageFont.truetype(str(pj), size)
    inter = Path("/usr/share/fonts/opentype/inter") / ("Inter-Bold.otf" if weight >= 700 else "Inter-SemiBold.otf" if weight >= 600 else "Inter-Regular.otf")
    if inter.exists():
        return ImageFont.truetype(str(inter), size)
    return ImageFont.truetype(str(ROOT / "assets-build" / ("DejaVuSans-Bold.ttf" if weight >= 600 else "DejaVuSans.ttf")), size)


COVER_BLOCKS = [  # (col, row, w, h, colour) on a 4x4 grid; first entry holds the lesson number
    (0, 0, 2, 2, "#2ad03d"), (2, 0, 1, 1, "#1bbe72"), (3, 0, 1, 1, "#8cffcc"), (2, 1, 2, 1, "#1d4130"),
    (0, 2, 1, 1, "#1d4130"), (1, 2, 1, 1, "#8cffcc"), (2, 2, 2, 1, "#1bbe72"), (0, 3, 2, 1, "#8cffcc"), (3, 3, 1, 1, "#2ad03d"),
]


def video_cover(a, mod, total, path):
    """1280x720 video cover in the DSC design system."""
    from PIL import Image, ImageDraw
    W, H = 1280, 720
    im = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(im)
    # block composition on the right, mirrored per lesson for variety
    gx, cw, ch = 760, 130, 180
    idx = a["order"] - 1
    flip_x, flip_y = idx % 2 == 1, (idx // 2) % 2 == 1
    for i, (c, r, w, h, col) in enumerate(COVER_BLOCKS):
        if flip_x:
            c = 4 - c - w
        if flip_y:
            r = 4 - r - h
        x0, y0 = gx + c * cw, r * ch
        d.rectangle([x0, y0, x0 + w * cw - 1, y0 + h * ch - 1], fill=col)
        if i == 0:
            d.text((x0 + w * cw / 2, y0 + h * ch / 2), a["num"], font=_cover_font(170, 800), fill=INK, anchor="mm")
    # logo
    logo = Image.open(ROOT / "static" / "img" / "logo-green.png").convert("RGBA")
    logo = logo.resize((int(logo.width * 1.6), int(logo.height * 1.6)), Image.LANCZOS)
    im.paste(logo, (72, 64), logo)
    d.line([(72 + logo.width + 18, 66), (72 + logo.width + 18, 64 + logo.height - 2)], fill="#ffffff", width=2)
    d.text((72 + logo.width + 34, 64 + logo.height / 2), "Academy", font=_cover_font(28, 700), fill="#ffffff", anchor="lm")
    # kicker + title
    d.text((72, 214), f"{mod['title'].upper()} · BÀI {a['num']} / {total:02d}", font=_cover_font(22, 700), fill="#8cffcc")
    tf, y = _cover_font(58, 700), 258
    lines = _wrap(d, a["title"], tf, 620)
    if len(lines) > 4:
        tf = _cover_font(48, 700)
        lines = _wrap(d, a["title"], tf, 620)
    for line in lines[:5]:
        d.text((72, y), line, font=tf, fill="#ffffff")
        y += int(tf.size * 1.18)
    # play button + duration
    by = H - 72 - 76
    d.rectangle([72, by, 72 + 76, by + 76], fill="#2ad03d")
    d.polygon([(100, by + 22), (100, by + 54), (128, by + 38)], fill=INK)
    d.text((72 + 76 + 24, by + 38), f"Xem video · {a['video_len']}", font=_cover_font(28, 600), fill="#ffffff", anchor="lm")
    im.save(path, quality=86, optimize=True, progressive=True)


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
    DIST.mkdir(exist_ok=True)

    site = yaml.safe_load((CONTENT / "site.yaml").read_text(encoding="utf-8"))
    modules = yaml.safe_load((CONTENT / "modules.yaml").read_text(encoding="utf-8"))
    glossary = yaml.safe_load((CONTENT / "glossary.yaml").read_text(encoding="utf-8"))
    badges = yaml.safe_load((CONTENT / "badges.yaml").read_text(encoding="utf-8"))
    (DIST / "img" / "badges").mkdir(parents=True, exist_ok=True)
    for b in badges:
        b["img"] = f"{BASE}/img/badges/{b['id']}.svg"
        b["og"] = f"{BASE}/img/badges/{b['id']}-og.png"
        b["url"] = f"{BASE}/huy-hieu/{b['id']}/"
        (DIST / "img" / "badges" / f"{b['id']}.svg").write_text(badge_svg(b["art"]), encoding="utf-8")
        badge_og_png(b, DIST / "img" / "badges" / f"{b['id']}-og.png")
    badges_public = [{k: b.get(k) for k in ("id", "name", "desc", "group", "tier", "rule", "points", "hidden", "img", "url")} for b in badges]

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
    import hashlib
    asset_v = hashlib.md5(
        (ROOT / "static" / "css" / "style.css").read_bytes() + (ROOT / "static" / "js" / "app.js").read_bytes()
    ).hexdigest()[:10]
    env.globals["asset_v"] = asset_v
    env.globals.update(
        base=BASE, site=site, site_url=SITE_URL, tier_label=TIER_LABEL,
        level_label=LEVEL_LABEL, year=date.today().year, badges=badges_public,
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
            vfile = ROOT / "static" / "video" / mod["slug"] / (a.get("video") or f"{a['slug']}.mp4")
            if vfile.exists():
                rel = vfile.relative_to(ROOT / "static").as_posix()
                secs = mp4_duration(vfile) or 0
                a["video_url"] = f"{BASE}/{rel}"
                a["video_secs"] = int(round(secs))
                m_, s_ = divmod(a["video_secs"], 60)
                a["video_len"] = f"{m_}:{s_:02d}"
                a["video_poster"] = f"{BASE}/img/video-covers/{mod['slug']}/{a['slug']}.jpg"
            for i, q in enumerate(a.get("quiz", [])):
                q["id"] = f"q{i + 1}"
                check_question(q, f"{f.name} quiz {i + 1}")
            mod["articles"].append(a)
        mod["articles"].sort(key=lambda a: a["order"])
        covers = DIST / "img" / "video-covers" / mod["slug"]
        for a in mod["articles"]:
            if a.get("video_url"):
                covers.mkdir(parents=True, exist_ok=True)
                video_cover(a, mod, len(mod["articles"]), covers / f"{a['slug']}.jpg")
        mod["tiers"] = [a["tier"] for a in mod["articles"]]
        mod["minutes"] = sum(a.get("minutes", 0) for a in mod["articles"])
        exam_file = CONTENT / "bai-thi" / f"{mod['slug']}.yaml"
        mod["exam"] = yaml.safe_load(exam_file.read_text(encoding="utf-8")) if exam_file.exists() else None
        if mod["exam"]:
            mod["exam_url"] = f"{mod['url']}bai-thi/"
            for i, q in enumerate(mod["exam"]["questions"]):
                check_question(q, f"exam {mod['slug']} q{i + 1}")

    totals = {m["slug"]: len(m["articles"]) for m in modules}
    for b in badges_public:
        if "module" in b["rule"]:
            b["total"] = totals.get(b["rule"]["module"], 0)

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

    for b in badges:
        out(f"huy-hieu/{b['id']}", "badge.html", title=f"Huy hiệu {b['name']}", description=b["desc"], b=b)
    out("huy-hieu", "badges.html", title="Huy hiệu", description="Các huy hiệu bạn có thể đạt khi học trên DSC Academy.", all_badges=badges)

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
