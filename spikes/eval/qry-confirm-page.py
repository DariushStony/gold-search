# Spike (PRD M2): owner confirmation page for EV-QRY rows relabelled with chip
# schema v2 (D-23). Shows only rows that changed or that the owner commented on.
# Run: python3 -I spikes/eval/qry-confirm-page.py
import csv, html, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/eval/review-qry-v2.html"

CHIPS = [  # (column, label, is_preference)
    ("intent", "نیت", False), ("item_type", "نوع", False), ("form", "شکل", False), ("budget_min", "حداقل بودجه", False),
    ("budget_max", "حداکثر بودجه", False), ("budget_target", "بودجه‌ی هدف", True), ("weight_min", "حداقل وزن", False),
    ("weight_max", "حداکثر وزن", False), ("weight_target", "وزن هدف", True), ("weight_pref", "ترجیح وزن", True),
    ("karat", "عیار", False), ("audience", "مخاطب", False), ("condition", "وضعیت", False), ("ojrat_max", "حداکثر اجرت ٪", False),
    ("ojrat_pref", "ترجیح اجرت", True), ("no_stones", "بدون سنگ", False), ("price_pref", "ترجیح قیمت", True),
    ("style", "طرح", False), ("shop", "فروشگاه", False), ("torob_pay", "قسطی", False), ("in_person", "حضوری", False),
    ("city", "شهر", False), ("occasion", "مناسبت", False),
]
VAL = {"gift": "هدیه", "beauty": "زیبایی", "savings": "پس‌انداز", "women": "زن", "men": "مرد", "girl": "دختر", "boy": "پسر", "kids": "بچه",
       "used": "دست‌دوم", "True": "بله", "true": "بله", "light": "سبک", "heavy": "سنگین", "low": "کم", "lowest": "کمترین"}
ASK = {"intent": "سیستم باید بپرسد: «برای چی می‌خری؟»", "budget_unit": "سیستم باید بپرسد: «هزار تومان یا میلیون؟»"}


def show(col: str, v: str) -> str:
    if col in ("budget_min", "budget_max", "budget_target"):
        x = float(v)
        return f"{x / 1e6:g} میلیون تومان" if x >= 1e6 else f"{x:,.0f} تومان"
    if col in ("weight_min", "weight_max", "weight_target"):
        return f"{float(v):g} گرم"
    return VAL.get(v, v).replace("_", " ")


ids = (ROOT / "data/eval/qry-confirm-ids.txt").read_text().split(",")
rows = {r["id"]: r for p in ("ev-qry-authored-2026-10-23.csv", "ev-qry-real-2026-10-23.csv")
        for r in csv.DictReader((ROOT / "docs/evidence" / p).open(encoding="utf-8"))}
notes = {r["id"]: r for r in csv.DictReader((ROOT / "docs/evidence/ev-qry-review-2026-10-23.csv").open(encoding="utf-8"))}

cards = []
for i, qid in enumerate(ids, 1):
    r = rows[qid]
    chips = []
    for col, label, pref in CHIPS:
        v = r.get(col, "")
        if not v or (col == "intent" and v == "unknown"):
            continue
        cls = "chip pref" if pref else "chip"
        chips.append(f"<span class='{cls}'>{label}: {html.escape(show(col, v))}{' (ترجیح)' if pref else ''}</span>")
    ask = ASK.get(r.get("expected_ask", ""), "")
    prev = notes[qid]
    prev_txt = f"قبلاً: {'غلط' if prev['owner_verdict'] == 'wrong' else 'درست'}" + (f" — «{html.escape(prev['owner_note'])}»" if prev["owner_note"] else "")
    cards.append(f"""<article class="card" data-id="{qid}"><div class="num">{i} از {len(ids)} · {qid}</div>
<div class="sentence">«{html.escape(r['text'])}»</div><div class="chips">{''.join(chips) or '<span class="chip">هیچ شرطی</span>'}</div>
{f'<div class="ask">{ask}</div>' if ask else ''}<div class="prev">{prev_txt}</div>
<div class="btns"><button data-v="ok">درست</button><button data-v="wrong">هنوز غلط است</button></div>
<input class="note" placeholder="اگر غلط است، کوتاه بنویس کجا (اختیاری)"></article>""")

template = (ROOT / "data/eval/review-stage2.html").read_text(encoding="utf-8")
head = template.split("<main>")[0]
script = template[template.index("<script>"):]
page = (head.replace("بازبینی مرحله‌ی ۲", "تأیید برچسب‌های جدید جمله‌ها")
        .replace("</style>", ".chip.pref{border:1px dashed var(--muted)} .ask{margin-top:6px;color:var(--accent)} .prev{margin-top:6px;color:var(--muted);font-size:13px}</style>")
        + "<main><h1>تأیید برچسب‌های جدید جمله‌ها</h1>"
        + "<p>بر اساس یادداشت‌هایت شِمای چیپ‌ها عوض شد. چیپ‌های خط‌چین <b>ترجیح</b>اند (فقط ترتیب را عوض می‌کنند)؛ بقیه <b>فیلتر</b>اند (حذف می‌کنند). «نامشخص» دیگر چیپ نیست؛ سیستم سؤال می‌پرسد.</p>"
        + "".join(cards)
        + '<div id="done"><b id="count"></b> <button id="copy">کپی نتیجه</button><textarea id="out" readonly></textarea></div></main>'
        + script.replace("review-stage2-2026-10-23", "review-qry-v2-2026-10-23"))
OUT.write_text(page, encoding="utf-8")
print(json.dumps({"rows": len(ids), "page": str(OUT)}))
