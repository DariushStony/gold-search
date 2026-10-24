# Spike (PRD M2): builds the owner's click-through review page for EV-MCH pairs
# and EV-QRY labels (owner preference: one page, buttons, resumable).
# Run: python3 -I spikes/eval/review-page.py
import csv, html, json, random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/eval/review-stage2.html"

CHIP_FA = {"intent": "نیت", "item_type": "نوع", "budget_min": "حداقل بودجه", "budget_max": "حداکثر بودجه", "weight_min": "حداقل وزن",
           "weight_max": "حداکثر وزن", "karat": "عیار", "audience": "مخاطب", "condition": "وضعیت", "style": "طرح", "gallery": "گالری",
           "torob_pay": "قسطی", "in_person": "حضوری", "occasion": "مناسبت"}
VAL_FA = {"gift": "هدیه", "beauty": "زیبایی/نگه‌داری", "savings": "پس‌انداز", "women": "زنانه", "men": "مردانه", "kids": "بچه", "used": "دست‌دوم", "True": "بله"}


def fa_num(v: str) -> str:
    try:
        x = float(v)
    except ValueError:
        return VAL_FA.get(v, v).replace("_", " ")
    if x >= 1_000_000:
        return f"{x / 1_000_000:g} میلیون تومان"
    return f"{x:g}"


def esc(s) -> str:
    return html.escape(str(s or ""))


rnd = random.Random(42)
pairs = [json.loads(l) for l in (ROOT / "data/eval/ev-mch-pairs.jsonl").read_text(encoding="utf-8").splitlines() if l]
rnd.shuffle(pairs)
mch_cards = []
for i, p in enumerate(pairs, 1):
    t, d = p["torob"], p["dk"]
    side = lambda src, x: f"""<div class="side"><div class="src">{src}</div>{'<img src="' + esc(x['image']) + '" alt="" loading="lazy">' if x.get('image') else ''}
<div class="t">{esc(x['title'])}</div><div class="meta">{f"{x['price']:,}".replace(",", "٬")} تومان</div><a href="{esc(x['url'])}" target="_blank" rel="noopener">صفحه ↗</a></div>"""
    mch_cards.append(f"""<article class="card" data-id="M{p['pair']:03d}"><div class="num">جفت {i} از {len(pairs)}</div>
<div class="pair">{side('ترب', t)}{side('دیجی‌کالا', d)}</div>
<div class="q">این دو، <b>یک کالای فیزیکی یکسان</b> از یک سازنده‌اند؟ (هم‌طرح بودن کافی نیست)</div>
<div class="btns three"><button data-v="same">یکی‌اند</button><button data-v="different">یکی نیستند</button><button data-v="unsure">مطمئن نیستم</button></div></article>""")

queries = list(csv.DictReader((ROOT / "docs/evidence/ev-qry-authored-2026-10-23.csv").open(encoding="utf-8")))
real = ROOT / "data/eval/ev-qry-real-labelled.csv"
if real.exists():
    queries += list(csv.DictReader(real.open(encoding="utf-8")))
qry_cards = []
for i, q in enumerate(queries, 1):
    chips = "".join(f"<span class='chip'>{CHIP_FA[k]}: {esc(fa_num(q[k]))}</span>" for k in CHIP_FA if q.get(k))
    src = "جمله‌ی واقعی" if q.get("source") == "real" else "جمله‌ی نوشته‌شده"
    qry_cards.append(f"""<article class="card" data-id="{esc(q['id'])}"><div class="num">جمله {i} از {len(queries)} · {src}</div>
<div class="sentence">«{esc(q['text'])}»</div><div class="chips">{chips or '<span class="chip">هیچ شرطی</span>'}</div>
<div class="q">آیا همه‌ی چیپ‌ها درست‌اند و چیزی جا نیفتاده؟</div>
<div class="btns"><button data-v="ok">همه درست</button><button data-v="wrong">یک جا غلط است</button></div>
<input class="note" placeholder="اگر غلط است، کوتاه بنویس کجا (اختیاری)"></article>""")

page = f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>بازبینی مرحله‌ی ۲</title><style>
:root{{--bg:#f6f5f2;--card:#fff;--text:#1d1d1f;--muted:#666;--accent:#b4232a;--on:#1f7a3a;--chip:#f0ece4}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141414;--card:#1f1f1f;--text:#eee;--muted:#aaa;--chip:#2c2a26}}}}
body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 Vazirmatn,Tahoma,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:16px}} h2.sec{{margin:32px 0 8px}}
.card{{background:var(--card);border-radius:12px;padding:16px;margin:0 0 16px}}
.num{{color:var(--muted);font-size:13px}} .pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
.side img{{width:100%;height:170px;object-fit:contain;background:#fff;border-radius:8px}} .src{{font-weight:bold}}
.t{{font-size:15px}} .meta{{color:var(--muted)}} .q{{margin-top:10px}} .sentence{{font-size:19px;margin:6px 0}}
.chip{{display:inline-block;background:var(--chip);border-radius:999px;padding:2px 10px;margin:2px;font-size:14px}}
.btns{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}} .btns.three{{grid-template-columns:1fr 1fr 1fr}}
button{{min-height:44px;border:1px solid #ccc;border-radius:8px;background:transparent;color:var(--text);font:inherit;cursor:pointer}}
button.on{{background:var(--on);color:#fff;border-color:var(--on)}}
.note{{width:100%;margin-top:8px;min-height:36px;border:1px solid #ccc;border-radius:8px;padding:4px 8px;font:inherit;background:transparent;color:var(--text);box-sizing:border-box}}
#done{{position:sticky;bottom:0;background:var(--card);padding:12px;border-radius:12px;box-shadow:0 -2px 12px #0002}}
#out{{width:100%;min-height:60px;font:12px monospace;direction:ltr}} a{{color:var(--accent)}}
@media (max-width:520px){{.pair{{grid-template-columns:1fr}}}}
</style></head><body><main>
<h1>بازبینی مرحله‌ی ۲</h1>
<p>دو بخش دارد. جواب‌ها در همین مرورگر ذخیره می‌شوند؛ می‌توانی صفحه را ببندی و بعداً ادامه بدهی. آخر کار «کپی نتیجه» را بزن و متن را بفرست.</p>
<h2 class="sec">بخش ۱: آیا این دو کالا یکی‌اند؟ ({len(pairs)} جفت)</h2>
{''.join(mch_cards)}
<h2 class="sec">بخش ۲: آیا سیستم جمله را درست فهمیده؟ ({len(queries)} جمله)</h2>
{''.join(qry_cards)}
<div id="done"><b id="count"></b> <button id="copy">کپی نتیجه</button><textarea id="out" readonly></textarea></div>
</main><script>
const KEY = "review-stage2-2026-10-23";
const cards = [...document.querySelectorAll(".card")];
const fa = n => String(n).replace(/\\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
let st = {{}};
try {{ st = JSON.parse(localStorage.getItem(KEY) || "{{}}"); }} catch (e) {{}}
const save = () => {{ try {{ localStorage.setItem(KEY, JSON.stringify(st)); }} catch (e) {{}} }};
const render = () => {{
  cards.forEach(c => {{
    const s = st[c.dataset.id] || {{}};
    c.querySelectorAll("button").forEach(b => b.classList.toggle("on", s.v === b.dataset.v));
    const n = c.querySelector(".note"); if (n && s.note !== undefined && n.value !== s.note) n.value = s.note;
  }});
  const done = cards.filter(c => (st[c.dataset.id] || {{}}).v).length;
  document.getElementById("count").textContent = fa(done) + " از " + fa(cards.length);
  document.getElementById("out").value = cards.filter(c => (st[c.dataset.id] || {{}}).v)
    .map(c => {{ const s = st[c.dataset.id]; return c.dataset.id + ":" + s.v + (s.note ? "(" + s.note.replace(/[()\\s]+/g, "_") + ")" : ""); }}).join(" ");
}};
cards.forEach(c => {{
  c.querySelectorAll("button").forEach(b => b.onclick = () => {{
    st[c.dataset.id] = {{ ...(st[c.dataset.id] || {{}}), v: b.dataset.v }}; save(); render();
    if (b.dataset.v !== "wrong") {{ const next = cards.find(x => !(st[x.dataset.id] || {{}}).v); if (next) next.scrollIntoView({{ behavior: "smooth", block: "start" }}); }}
  }});
  const n = c.querySelector(".note"); if (n) n.oninput = () => {{ st[c.dataset.id] = {{ ...(st[c.dataset.id] || {{}}), note: n.value }}; save(); render(); }};
}});
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(document.getElementById("out").value);
render();
</script></body></html>"""
OUT.write_text(page, encoding="utf-8")
print(json.dumps({"pairs": len(pairs), "queries": len(queries), "page": str(OUT)}))
