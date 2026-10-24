# Owner labels the EV-MAT tune split blind (D-32: the AI's tune labels follow a
# different definition of gold than the owner's). Rows most likely to differ
# come first, so stopping early still helps. Run: python3 -I spikes/eval/tune-label-page.py
import csv, html, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/eval/tune-label-review.html"
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
esc = lambda s: html.escape(str(s or ""))
fa = lambda s: str(s).translate(FA)
RISKY = r"نگین|سنگ|عقیق|برلیان|الماس|مروارید|صدف|نخ|چرم|مهره|میوکی|گوی|بند |ورق|روس"

labels = [r for r in csv.DictReader((ROOT / "docs/evidence/ev-mat-labels-2026-10-22.csv").open(encoding="utf-8")) if r["split"] == "tune"]


def page_bits(key: str):
    path = ROOT / f"data/raw/details/{key}.json"
    if not path.exists():
        return None, [], []
    body = json.loads(path.read_text(encoding="utf-8"))["body"]
    specs = []
    for h in (body.get("structural_specs") or {}).get("headers", []):
        specs += [f"{k}: {v}" for k, v in (h.get("specs") or {}).items()]
    for h in body.get("key_specs") or []:
        specs += [f"{i.get('key')}: {', '.join(map(str, i.get('value') or []))}" for i in h.get("items", [])]
    specs = [s for s in specs if re.search(r"جنس|سنگ|نگین|وزن|عیار|متعلقات", s)][:6]
    offers = (body.get("products_info") or {}).get("result", []) + (body.get("products_in_store_info") or {}).get("result", [])
    shops = [f"{o.get('shop_name', '')}: {o.get('name1', '')}" for o in offers if (o.get("price") or 0) > 0][:2]
    return body.get("image_url"), specs, shops


def risk(r) -> int:
    t = r["title"]
    score = 2 * bool(re.search(RISKY, t)) + 2 * (r["ai_label"] in ("mixed", "unsure")) + ("طلا" not in t)
    return score + (r["ai_label"] == "gold" and not r["weight_g"] and int(r["price_toman"]) < 3_000_000)


labels.sort(key=lambda r: (-risk(r), int(r["row"])))
BTN = '<div class="btns four"><button data-v="gold">طلا</button><button data-v="mixed">مخلوط</button><button data-v="not_gold">غیرطلا</button><button data-v="unsure">مطمئن نیستم</button></div>'

defs = [
    ("D1", "طلای ۱۸ عیار با یک سنگ کوچک نشانده (مثلاً «انگشتر طلا با نگین عقیق») را چه حساب کنیم؟"),
    ("D2", "دستبند نخی یا چرمی که یک یا چند گوی یا پلاک طلا دارد را چه حساب کنیم؟"),
]
cards = [f"""<article class="card" data-id="{i}"><div class="num">تعریف</div><div class="t">{esc(q)}</div>
<div class="btns"><button data-v="gold">طلا</button><button data-v="mixed">مخلوط</button></div></article>""" for i, q in defs]
for n, r in enumerate(labels, 1):
    img, specs, shops = page_bits(r["random_key"])
    cards.append(f"""<article class="card" data-id="T{r['row']}"><div class="num">کالای {fa(n)} از {fa(len(labels))}</div>
<div class="row">{f'<img src="{esc(img)}" alt="" loading="lazy">' if img else ''}<div>
<div class="t">{esc(r['title'])}</div><div class="meta">{fa(f"{int(r['price_toman']):,}").replace(",", "٬")} تومان · <a href="{esc(r['url'])}" target="_blank" rel="noopener">صفحه در ترب ↗</a></div></div></div>
<div class="ev">{''.join(f'<div>{esc(s)}</div>' for s in specs) or '<div class="muted">مشخصاتی درباره‌ی جنس ندارد</div>'}
{''.join(f'<div class="muted">فروشگاه {esc(s)}</div>' for s in shops)}</div>
<div class="q">جنس این کالا چیست؟</div>{BTN}
<input class="note" placeholder="اگر چیزی می‌خواهی بگویی (اختیاری)"></article>""")

template = (ROOT / "spikes/eval/review-page.py").read_text(encoding="utf-8")
style = re.search(r"<style>(.*?)</style>", template, re.S).group(1).replace("{{", "{").replace("}}", "}")
script = re.search(r"<script>(.*?)</script>", template, re.S).group(1).replace("{{", "{").replace("}}", "}")
script = script.replace('"review-stage2-2026-10-23"', '"tune-label-review-2026-10-24"').replace('b.dataset.v !== "wrong"', "true")
page = f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>برچسب جنس، بخش تنظیم</title><style>{style}
.btns.four{{grid-template-columns:repeat(4,1fr)}} .row{{display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:start}}
.row img{{width:96px;height:96px;object-fit:contain;background:#fff;border-radius:8px}}
.ev{{background:var(--chip);border-radius:8px;padding:8px 10px;margin:8px 0;font-size:14px}} .muted{{color:var(--muted)}}
@media (max-width:520px){{.btns.four{{grid-template-columns:1fr 1fr}}}}
</style></head><body><main>
<h1>برچسب جنس ({fa(len(labels))} کالای بخش تنظیم)</h1>
<p>اول دو سؤال تعریف، بعد برای هر کالا فقط بگو طلاست، مخلوط است یا غیرطلا. برچسب قبلی را نمی‌بینی تا نظرت مستقل بماند. کالاهایی که احتمال اختلاف بیشتری دارند اول آمده‌اند، پس هر جا خسته شدی می‌توانی بایستی و همان‌قدر را بفرستی. جواب‌ها در همین مرورگر ذخیره می‌شوند؛ آخر کار «کپی نتیجه» را بزن و متن را بفرست.</p>
{''.join(cards)}
<div id="done"><b id="count"></b> <button id="copy">کپی نتیجه</button><textarea id="out" readonly></textarea></div>
</main><script>{script}</script></body></html>"""
OUT.write_text(page, encoding="utf-8")
print(json.dumps({"rows": len(labels), "risky_first": sum(risk(r) > 0 for r in labels), "page": str(OUT)}))
