# CLAUDE.md — WestConnect Field Report

## What Is This?
Appointment management system for fiber installation teams. Static HTML pages + auto-generated `citas.json`.

## Repo & Deploy
- **Local:** `~/Dev/field-report/`
- **GitHub:** jarl9801/field-report (public)
- **Live:** https://jarl9801.github.io/field-report/
- **Deploy:** `git add -A && git commit -m "..." && git push` (GitHub Pages auto-deploys)

## Architecture
```
Google Calendar (Umtelkomd team)
        ↓ (gog CLI)
  sync_citas.sh (cron every 15min by LobsterOps)
        ↓
  citas.json (committed + pushed to GitHub)
        ↓
  admin.html / westconnect.html (read citas.json directly)
```

**`citas.json` is the SOLE source of truth** — admin.html reads it directly, no Apps Script for reads.

## Key Files
| File | Purpose |
|------|---------|
| `citas.json` | All appointments — auto-generated, DO NOT edit manually |
| `admin.html` | Admin view: grouped by date, assign teams (PIN: **0223**) |
| `westconnect.html` | Tech view: shows citas for logged-in team only |
| `scripts/sync_citas.sh` | Cron script: calendar → citas.json |

## sync_citas.sh Details
- Reads calendar via `gog calendar events --json --limit 50 --days 14`
- Calendar ID: `a400089061a6fa2a053b8e3e3d1236767b2b97a5d5173b2e4d1f1734a5337ee0@group.calendar.google.com`
- Filters events matching: `TK.*Umtel[ck]o?md.*Install.*HA` (handles Umtelkomd/Umtelcomd typo)
- Fetches existing assignments from Apps Script (per-date GET requests)
- **Dual-key merge:** matches by `uid` AND by HA number (handles UUID vs date_ha ID mismatch)
- Commits and pushes citas.json automatically

## Apps Script
- **URL:** `https://script.google.com/macros/s/AKfycbz6YI1Oh-tutU3q5NfPJxDq77QKDMVX6DtM92YZ_GxgKYqm0XXymVCOi08k4SuDteXr/exec`
- **Writes use GET** (not POST) — POST triggers Google auth redirect
- Used for team assignments only; reads come from citas.json

## Status Values
- Active: pending, assigned
- Done: `completada`, `no_asistio`, `reagendada`, `cancelada`
- Constant: `DONE_STATUS = ['completada', 'no_asistio', 'reagendada', 'cancelada']`

## Views
- **Admin** (`admin.html`): PIN-protected, groups citas by date, drag-assign teams
- **Tech** (`westconnect.html`): Team login, shows only their citas, auto-advances to next day with assignments
