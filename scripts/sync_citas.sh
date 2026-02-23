#!/bin/bash
# sync_citas.sh — Genera citas.json desde calendario Umtelkomd (con location)
# Cron: 9PM noche anterior (Dom-Vie)

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

TEAM_CAL="a400089061a6fa2a053b8e3e3d1236767b2b97a5d5173b2e4d1f1734a5337ee0@group.calendar.google.com"

echo "📅 Leyendo calendario Umtelkomd (14 días, JSON)..."
GOG_ACCOUNT=jromero@umtelkomd.com gog calendar events "$TEAM_CAL" --days 14 --limit 50 --json \
  > /tmp/cal_team_json.json 2>&1

SCRIPT_URL="https://script.google.com/macros/s/AKfycbz6YI1Oh-tutU3q5NfPJxDq77QKDMVX6DtM92YZ_GxgKYqm0XXymVCOi08k4SuDteXr/exec"

echo "📋 Leyendo asignaciones del Apps Script (próximos 14 días)..."
# getAllCitas filtra por fecha — consultamos cada fecha del rango
python3 - << 'DATES_PYEOF'
import subprocess, json
from datetime import date, timedelta

all_citas = []
today = date.today()
for i in range(15):
    d = (today + timedelta(days=i)).isoformat()
    url = f"https://script.google.com/macros/s/AKfycbz6YI1Oh-tutU3q5NfPJxDq77QKDMVX6DtM92YZ_GxgKYqm0XXymVCOi08k4SuDteXr/exec?action=getAllCitas&date={d}"
    try:
        r = subprocess.run(['curl', '-sL', url], capture_output=True, text=True, timeout=10)
        data = json.loads(r.stdout)
        citas = data.get('citas', [])
        if citas:
            all_citas.extend(citas)
            print(f"  {d}: {len(citas)} asignadas")
    except Exception as e:
        pass

with open('/tmp/assignments.json', 'w') as f:
    json.dump({'citas': all_citas}, f)
print(f"Total asignaciones: {len(all_citas)}")
DATES_PYEOF

python3 - << 'PYEOF'
import json, re, urllib.request
from datetime import datetime

with open('/tmp/cal_team_json.json') as f:
    raw = json.load(f)

# Cargar asignaciones existentes del Sheet
try:
    with open('/tmp/assignments.json') as f:
        assign_data = json.load(f)
    assignments = {a['id']: a for a in assign_data.get('citas', []) if a.get('id')}
except Exception:
    assignments = {}

events = raw if isinstance(raw, list) else raw.get('items', raw.get('events', []))

seen, citas = set(), []
for e in events:
    title = e.get('summary', '')
    if not re.search(r'TK.*Umtelkomd.*Install.*HA', title, re.I):
        continue

    start_raw = e.get('start', {})
    end_raw   = e.get('end', {})
    start = start_raw.get('dateTime', start_raw.get('date', ''))
    end   = end_raw.get('dateTime', end_raw.get('date', ''))

    ha_m = re.search(r'HA(\d+)', title, re.I)
    tk_m = re.search(r'^(\d+)\s*TK', title, re.I)
    ha_n = ha_m.group(1) if ha_m else 'NA'
    uid  = f"{start[:10]}_{ha_n}"
    if uid in seen: continue
    seen.add(uid)

    location = e.get('location', '') or ''
    loc_m = re.match(r'^(.+),\s*(\d{5})\s+([^,]+)', location)

    # Merge asignaciones del Sheet si existen
    a = assignments.get(uid, {})

    citas.append({
        "id":       uid,
        "fecha":    start[:10],
        "ha":       f"HA{ha_n}" if ha_m else title[:30],
        "tecnicos": int(tk_m.group(1)) if tk_m else 0,
        "inicio":   start[11:16] if len(start) > 15 else '',
        "fin":      end[11:16]   if len(end)   > 15 else '',
        "calle":    loc_m.group(1).strip() if loc_m else location,
        "cp":       loc_m.group(2) if loc_m else '',
        "ciudad":   loc_m.group(3).replace(', Deutschland', '').strip() if loc_m else '',
        "titulo":   title,
        # Preservar asignación si existe, si no → libre
        "equipo":   a.get("equipo", ""),
        "status":   a.get("status", "libre"),
        "linkDocs": a.get("linkDocs", "")
    })

result = {
    "generated": datetime.now().isoformat(),
    "citas": sorted(citas, key=lambda x: (x['fecha'], x['inicio']))
}
with open('citas.json', 'w') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

assigned_count = sum(1 for c in citas if c['equipo'])
print(f"✅ {len(citas)} citas generadas ({assigned_count} asignadas)")
for c in result['citas']:
    eq = f" → {c['equipo']}" if c['equipo'] else ""
    print(f"  {c['fecha']} | {c['ha']} | {c['calle']}, {c['cp']} {c['ciudad']} | {c['inicio']}-{c['fin']} | {c['tecnicos']} TK{eq}")
PYEOF

git add citas.json
git diff --cached --quiet || git commit -m "sync: citas WC $(date +%Y-%m-%d)"
git push
echo "🚀 Push completado"
