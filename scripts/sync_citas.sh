#!/bin/bash
# sync_citas.sh — Genera citas.json desde calendario compartido Umtelkomd
# Cron: 9PM noche anterior (Dom-Vie)

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

TEAM_CAL="a400089061a6fa2a053b8e3e3d1236767b2b97a5d5173b2e4d1f1734a5337ee0@group.calendar.google.com"

echo "📅 Leyendo calendario Umtelkomd (14 días)..."
GOG_ACCOUNT=jromero@umtelkomd.com gog calendar events "$TEAM_CAL" --days 14 2>&1 \
  | grep -E "TK Umtelkomd.*Install.*HA" > /tmp/cal_team_raw.txt || true

echo "📅 Leyendo calendario personal (para enriquecer direcciones)..."
GOG_ACCOUNT=jromero@umtelkomd.com gog calendar list --days 14 2>&1 \
  | grep -iE "WC|Umtelkomd.*Install|HA[0-9]" > /tmp/cal_personal_raw.txt || true

python3 - << 'PYEOF'
import re, json
from datetime import datetime

def load_lines(path):
    try:
        with open(path) as f: return f.readlines()
    except: return []

# Mapa de direcciones desde calendario personal (tiene CP+ciudad+calle)
addr_map = {}
for line in load_lines('/tmp/cal_personal_raw.txt'):
    ha_m = re.search(r'HA(\d+)', line, re.I)
    cp_m = re.search(r'(\d{5})\s+([\w\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df\-]+)', line)
    st_m = re.search(r'\d{5}\s+[\w\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df\-]+[-\s]+(.+)$', line)
    if ha_m and cp_m:
        addr_map[ha_m.group(1)] = {
            "cp":     cp_m.group(1),
            "ciudad": cp_m.group(2),
            "calle":  st_m.group(1).replace('-', ' ').strip() if st_m else ''
        }

seen, citas = set(), []
for line in load_lines('/tmp/cal_team_raw.txt'):
    line = line.strip()
    dt_m = re.findall(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+\-]\d{2}:\d{2})', line)
    if len(dt_m) < 2: continue
    start, end = dt_m[0], dt_m[1]
    title = line[line.rfind(end) + len(end):].strip()
    if not title: continue

    ha_m = re.search(r'HA(\d+)', title, re.I)
    tk_m = re.search(r'^(\d+)\s*TK', title, re.I)
    ha_n = ha_m.group(1) if ha_m else 'NA'
    uid  = f"{start[:10]}_{ha_n}"
    if uid in seen: continue
    seen.add(uid)

    addr = addr_map.get(ha_n, {"cp": "", "ciudad": "", "calle": ""})
    citas.append({
        "id":       uid,
        "fecha":    start[:10],
        "ha":       f"HA{ha_n}" if ha_m else title[:30],
        "tecnicos": int(tk_m.group(1)) if tk_m else 0,
        "inicio":   start[11:16],
        "fin":      end[11:16],
        "cp":       addr["cp"],
        "ciudad":   addr["ciudad"],
        "calle":    addr["calle"],
        "titulo":   title,
        "equipo":   "", "status": "libre", "linkDocs": ""
    })

result = {"generated": datetime.now().isoformat(), "citas": citas}
with open('citas.json', 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"✅ {len(citas)} citas generadas")
for c in citas:
    addr = f"{c['ciudad']} {c['calle']}".strip() or "(sin dirección)"
    print(f"  {c['fecha']} | {c['ha']} | {addr} | {c['inicio']}-{c['fin']} | {c['tecnicos']} TK")
PYEOF

git add citas.json
git diff --cached --quiet || git commit -m "sync: citas WC $(date +%Y-%m-%d)"
git push
echo "🚀 Push completado"
