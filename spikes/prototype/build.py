# Design prototype (stage 03): static, clickable page built from real Torob
# listings of the 2026-10-22 snapshot. Ranking and chips are hand-set to show
# the design; the page says so. Run: python3 -I spikes/prototype/build.py
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
items = json.loads((ROOT / "data/eval/proto-items.json").read_text(encoding="utf-8"))
by_title = {i["title"]: i for i in items}


def pick(titles):
    return [by_title[t] for t in titles if t in by_title]


SCENARIOS = [
    {
        "id": "gift", "label": "هدیه",
        "text": "یه گردنبند یا پلاک ظریف برای روز مادر تا ۴۰ تومن",
        "chips": [["نوع", "گردنبند یا پلاک", "filter"], ["حداکثر بودجه", "۴۰ میلیون تومان", "filter"],
                  ["ترجیح وزن", "سبک", "sort"], ["نیت", "هدیه", "filter"], ["مناسبت", "روز مادر", "info"]],
        "items": pick(["پلاک گردنبند طلا ۱۸ عیار زنانه مدل چشم نظر", "پلاک طلا دختر پاییزی", "گردنبند طلا مینیمال کارتیه لاو قلب و گوی",
                       "گردنبند طلا شرابه", "گردنبند طلا ونکلیف ۱۸ عیار وزن ۱.۱۶ گرم", "گردنبند طلا زنانه دم وال ۱۸ عیار طول ۴۰ سانتی‌متر"]),
    },
    {
        "id": "savings", "label": "پس‌انداز",
        "text": "۶۰ میلیون دارم، النگوی کم‌اجرت که موقع فروش کمتر ضرر کنم",
        "chips": [["نوع", "النگو", "filter"], ["حداکثر بودجه", "۶۰ میلیون تومان", "filter"], ["حداکثر اجرت", "٪۱۰", "filter"], ["نیت", "پس‌انداز", "filter"]],
        "items": pick(["النگو طلا ۱۸ عیار آیینه ای بدون اجرت", "النگو طلا پروفیل بچگانه"]),
        "savings": True,
    },
    {
        "id": "beauty", "label": "زیبایی",
        "text": "گردنبند یا دستبند طلا طرح کارتیه یا ونکلیف",
        "chips": [["نوع", "گردنبند یا دستبند", "filter"], ["طرح", "کارتیه، ونکلیف", "sort"], ["نیت", "زیبایی", "filter"]],
        "items": pick(["گردنبند طلا ونکلیف ۱۸ عیار وزن ۱.۱۶ گرم", "گردنبند طلا مینیمال کارتیه لاو قلب و گوی", "دستبند طلا طرح تمام گوی کد FB132"]),
    },
]
EXCLUDED = [i for i in items if i["label"] == "not_gold"][:6]
REVIEW = [i for i in items if i["label"] == "mixed"][:2]

data = {"G": 27_017_000, "g_time": "۳۰ مهر ۱۴۰۵، ۱۰:۱۵", "scenarios": SCENARIOS, "excluded": EXCLUDED, "review": REVIEW}
tpl = (Path(__file__).parent / "template.html").read_text(encoding="utf-8")
out = ROOT / "docs/design/prototype.html"
out.write_text(tpl.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
print(json.dumps({"page": str(out), "gift": len(SCENARIOS[0]["items"]), "savings": len(SCENARIOS[1]["items"]), "beauty": len(SCENARIOS[2]["items"])}))
