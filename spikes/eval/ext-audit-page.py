# Owner audit of the EV-EXT test split (D-20): one click-through page showing
# the independent annotator's weight, karat and ojrat next to the evidence.
# Run: python3 -I spikes/eval/ext-audit-page.py
import csv, html, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/eval/ext-audit-test.html"
FA = str.maketrans("0123456789.", "۰۱۲۳۴۵۶۷۸۹٫")
esc = lambda s: html.escape(str(s or ""))
fa = lambda s: str(s).translate(FA)

material = {r["random_key"]: r for r in csv.DictReader((ROOT / "docs/evidence/ev-mat-labels-2026-10-22.csv").open(encoding="utf-8"))}
ai = [r for r in csv.DictReader((ROOT / "data/eval/ev-ext-ai.csv").open(encoding="utf-8")) if r["split"] == "test"]


def evidence(key: str) -> tuple[list[str], list[str]]:
    path = ROOT / f"data/raw/details/{key}.json"
    if not path.exists():
        return [], []
    body = json.loads(path.read_text(encoding="utf-8"))["body"]
    specs = []
    for h in (body.get("structural_specs") or {}).get("headers", []):
        specs += [f"{k}: {v}" for k, v in (h.get("specs") or {}).items()]
    for h in body.get("key_specs") or []:
        specs += [f"{i.get('key')}: {', '.join(map(str, i.get('value') or []))}" for i in h.get("items", [])]
    specs = [s for s in specs if re.search(r"وزن|weight|عیار|اجرت|جنس|سنگ|متعلقات", s, re.I)][:8]
    offers = (body.get("products_info") or {}).get("result", []) + (body.get("products_in_store_info") or {}).get("result", [])
    shops = [f"{o.get('shop_name', '')}: {o.get('name1', '')}" for o in offers if (o.get("price") or 0) > 0][:3]
    return specs, shops


cards = []
for i, r in enumerate(ai, 1):
    m = material[r["random_key"]]
    specs, shops = evidence(r["random_key"])
    ans = lambda v, unit="": f"<b>{fa(v)}{unit}</b>" if v else "<b>ندارد</b>"
    cards.append(f"""<article class="card" data-id="E{r['row']}"><div class="num">کالای {fa(i)} از {fa(len(ai))}</div>
<div class="t">{esc(m['title'])}</div><div class="meta">{fa(f"{int(m['price_toman']):,}").replace(",", "٬")} تومان · <a href="{esc(m['url'])}" target="_blank" rel="noopener">صفحه در ترب ↗</a></div>
<div class="ev">{''.join(f'<div>{esc(s)}</div>' for s in specs) or '<div class="muted">مشخصاتی درباره‌ی وزن یا عیار ندارد</div>'}
{''.join(f'<div class="muted">فروشگاه {esc(s)}</div>' for s in shops)}</div>
<div class="ans">وزن: {ans(r['weight_g'], ' گرم')} · عیار: {ans(r['karat'])} · اجرت: {ans(r['ojrat_pct'], '٪')}</div>
<div class="q">این سه عدد از روی عنوان و صفحه درست‌اند؟ («ندارد» یعنی جایی نوشته نشده یا چند وزن مختلف آمده)</div>
<div class="btns"><button data-v="ok">همه درست</button><button data-v="wrong">یکی غلط است</button></div>
<input class="note" placeholder="اگر غلط است، عدد درست را بنویس؛ مثلاً: وزن ۱٫۲ یا عیار ندارد"></article>""")

template = (ROOT / "spikes/eval/review-page.py").read_text(encoding="utf-8")
style = re.search(r"<style>(.*?)</style>", template, re.S).group(1).replace("{{", "{").replace("}}", "}")
script = re.search(r"<script>(.*?)</script>", template, re.S).group(1).replace("{{", "{").replace("}}", "}")
script = script.replace('"review-stage2-2026-10-23"', '"ext-audit-test-2026-10-23"')
page = f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>بازبینی وزن و عیار</title><style>{style}
.ev{{background:var(--chip);border-radius:8px;padding:8px 10px;margin:8px 0;font-size:14px}} .muted{{color:var(--muted)}} .ans{{font-size:17px}}
</style></head><body><main>
<h1>بازبینی وزن و عیار ({fa(len(ai))} کالای بخش آزمون)</h1>
<p>برای هر کالا یک خواننده‌ی مستقل وزن، عیار و اجرت را از عنوان و صفحه‌ی ترب خوانده. فقط بگو درست است یا نه. جواب‌ها در همین مرورگر ذخیره می‌شوند؛ آخر کار «کپی نتیجه» را بزن و متن را بفرست.</p>
{''.join(cards)}
<div id="done"><b id="count"></b> <button id="copy">کپی نتیجه</button><textarea id="out" readonly></textarea></div>
</main><script>{script}</script></body></html>"""
OUT.write_text(page, encoding="utf-8")
print(json.dumps({"rows": len(ai), "page": str(OUT)}))
