#!/bin/bash
# sync_citas.sh — Genera citas.json desde Google Calendar
# Ejecutar: bash scripts/sync_citas.sh
# Cron: 9PM noche anterior (Dom-Vie)

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "📅 Leyendo calendario WC..."
GOG_ACCOUNT=jromero@umtelkomd.com gog calendar list --days 14 2>&1 \
  | grep -iE "WC|Umtelkomd.*Install|HA[0-9]" > /tmp/cal_wc_raw.txt || true

python3 - << 'PYEOF'
import re, json, sys
from datetime import datetime

with open('/tmp/cal_wc_raw.txt') as f:
    lines = f.readlines()

citas = []
for line in lines:
    line = line.strip()
    dt_m = re.findall(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+\-]\d{2}:\d{2})', line)
    if len(dt_m) < 2:
        continue
    start, end = dt_m[0], dt_m[1]
    idx = line.rfind(end) + len(end)
    title = line[idx:].strip()
    if not title:
        continue

    ha_m  = re.search(r'HA(\d+)', title, re.I)
    tk_m  = re.search(r'^(\d+)\s*TK', title, re.I)
    cp_m  = re.search(r'(\d{5})\s+([\w\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df\-]+)', title)
    st_m  = re.search(r'\d{5}\s+[\w\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df\-]+[-\s]+(.+)$', title)

    citas.append({
        "id":       f"{start[:10]}_{ha_m.group(1) if ha_m else 'NA'}",
        "fecha":    start[:10],
        "ha":       f"HA{ha_m.group(1)}" if ha_m else '',
        "tecnicos": int(tk_m.group(1)) if tk_m else 0,
        "inicio":   start[11:16],
        "fin":      end[11:16],
        "cp":       cp_m.group(1) if cp_m else '',
        "ciudad":   cp_m.group(2) if cp_m else '',
        "calle":    st_m.group(1).replace('-', ' ').strip() if st_m else '',
        "titulo":   title,
        "equipo":   "", "status": "libre", "linkDocs": ""
    })

result = {"generated": datetime.now().isoformat(), "citas": citas}
with open('citas.json', 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"✅ {len(citas)} citas WC generadas → citas.json")
for c in citas:
    print(f"  {c['fecha']} | {c['ha']} | {c['ciudad']} | {c['inicio']}-{c['fin']} | {c['tecnicos']} TK")
PYEOF

git add citas.json
git diff --cached --quiet || git commit -m "sync: citas WC $(date +%Y-%m-%d)"
git push
echo "🚀 Push completado"
