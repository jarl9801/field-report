// ============================================
// CITAS.GS — Gestión de visitas WestConnect
// Archivo separado — agregar como nuevo script en Apps Script
// Las funciones doPost/doGet en Code.gs deben incluir los dispatchers
// ============================================

// ============================================

const CITAS_COLS = {
  ID: 1, CAL_EVENT_ID: 2, FECHA: 3, HA: 4, DIRECCION: 5,
  CP: 6, CIUDAD: 7, H_INICIO: 8, H_FIN: 9, TECNICOS: 10,
  EQUIPO: 11, STATUS: 12, LINK_DOCS: 13,
  TS_CREACION: 14, TS_ASIGNACION: 15, TS_CAPTURA: 16,
  TS_INICIO: 17, TS_FINAL: 18, NOTAS: 19
};
const STATUS = {
  LIBRE: 'libre', ASIGNADA: 'asignada', CAPTURADA: 'capturada',
  EN_TRABAJO: 'en_trabajo', FINALIZADA_OK: 'finalizada_ok',
  FINALIZADA_NO_OK: 'finalizada_no_ok', CLIENTE_AUSENTE: 'cliente_ausente',
  RECITAR: 'recitar', PARALIZADA: 'paralizada'
};

// ─── Asegurar que existe la hoja Citas ──────────────────────────────
function ensureCitasSheet() {
  const ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet   = ss.getSheetByName('Citas');
  if (!sheet) {
    sheet = ss.insertSheet('Citas');
    const headers = [
      'ID','CalEventId','Fecha','HA','Dirección','CP','Ciudad',
      'Hora Inicio','Hora Fin','Técnicos','Equipo','Status','Link Docs',
      'TS Creación','TS Asignación','TS Captura','TS Inicio Trabajo','TS Final','Notas'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ─── Sync citas del calendario al Sheet ─────────────────────────────
function syncCitasFromCalendar(params) {
  try {
    const tz      = 'Europe/Berlin';
    const dateStr = (params && params.date)
      ? params.date
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    // 1. Leer citas del calendario
    const calCitas = _readCalendarCitas(dateStr);

    // 2. Leer citas existentes en el Sheet para esa fecha
    const sheet     = ensureCitasSheet();
    const lastRow   = sheet.getLastRow();
    const existing  = {};  // calEventId → row number
    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, CITAS_COLS.NOTAS).getValues();
      data.forEach((row, i) => {
        if (_toDateStr(row[CITAS_COLS.FECHA - 1]) === dateStr && row[CITAS_COLS.CAL_EVENT_ID - 1]) {
          existing[row[CITAS_COLS.CAL_EVENT_ID - 1]] = i + 2; // 1-indexed + header
        }
      });
    }

    // 3. Insertar citas nuevas, omitir las ya existentes
    let added = 0;
    const now = new Date().toISOString();
    for (const c of calCitas) {
      if (existing[c.calEventId]) continue; // ya existe
      const newRow = [
        Utilities.getUuid(), c.calEventId, dateStr, c.ha,
        c.street, c.postalCode, c.city, c.start, c.end,
        c.technicians, '', STATUS.LIBRE, '', now, '', '', '', '', ''
      ];
      sheet.appendRow(newRow);
      added++;
    }

    return jsonResponse({ success: true, synced: calCitas.length, added: added, date: dateStr });
  } catch (err) {
    Logger.log('syncCitasFromCalendar error: ' + err);
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── GET: todas las citas de un día (admin) ──────────────────────────
function getAllCitasData(params) {
  try {
    const tz      = 'Europe/Berlin';
    const dateStr = (params && params.date)
      ? params.date
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    // Primero sincronizar del calendario
    syncCitasFromCalendar({ date: dateStr });

    // Luego leer del Sheet
    const sheet   = ensureCitasSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse({ success: true, citas: [], date: dateStr });

    const data  = sheet.getRange(2, 1, lastRow - 1, CITAS_COLS.NOTAS).getValues();
    const citas = data
      .filter(r => _toDateStr(r[CITAS_COLS.FECHA - 1]) === dateStr)
      .map((r, i) => ({
        id:         r[CITAS_COLS.ID - 1],
        ha:         r[CITAS_COLS.HA - 1],
        direccion:  r[CITAS_COLS.DIRECCION - 1],
        cp:         r[CITAS_COLS.CP - 1],
        ciudad:     r[CITAS_COLS.CIUDAD - 1],
        inicio:     r[CITAS_COLS.H_INICIO - 1],
        fin:        r[CITAS_COLS.H_FIN - 1],
        tecnicos:   r[CITAS_COLS.TECNICOS - 1],
        equipo:     r[CITAS_COLS.EQUIPO - 1],
        status:     r[CITAS_COLS.STATUS - 1],
        linkDocs:   r[CITAS_COLS.LINK_DOCS - 1],
        tsAsig:     r[CITAS_COLS.TS_ASIGNACION - 1],
        tsCaptura:  r[CITAS_COLS.TS_CAPTURA - 1]
      }));

    return jsonResponse({ success: true, citas: citas, date: dateStr });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── GET: citas asignadas a un equipo ───────────────────────────────
function getCitasByTeamData(params) {
  try {
    const tz      = 'Europe/Berlin';
    const dateStr = (params && params.date)
      ? params.date
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const equipo  = params && params.team ? params.team : '';

    const sheet   = ensureCitasSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse({ success: true, citas: [] });

    const data  = sheet.getRange(2, 1, lastRow - 1, CITAS_COLS.NOTAS).getValues();
    const citas = data
      .filter(r =>
        _toDateStr(r[CITAS_COLS.FECHA - 1]) === dateStr &&
        r[CITAS_COLS.EQUIPO - 1]            === equipo  &&
        r[CITAS_COLS.STATUS - 1]            !== STATUS.LIBRE
      )
      .map(r => ({
        id:        r[CITAS_COLS.ID - 1],
        ha:        r[CITAS_COLS.HA - 1],
        direccion: r[CITAS_COLS.DIRECCION - 1],
        cp:        r[CITAS_COLS.CP - 1],
        ciudad:    r[CITAS_COLS.CIUDAD - 1],
        inicio:    r[CITAS_COLS.H_INICIO - 1],
        fin:       r[CITAS_COLS.H_FIN - 1],
        tecnicos:  r[CITAS_COLS.TECNICOS - 1],
        status:    r[CITAS_COLS.STATUS - 1],
        linkDocs:  r[CITAS_COLS.LINK_DOCS - 1]
      }));

    return jsonResponse({ success: true, citas: citas, team: equipo, date: dateStr });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── POST: admin asigna cita a equipo ───────────────────────────────
function assignCitaData(data) {
  try {
    const sheet   = ensureCitasSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse({ success: false, error: 'No hay citas' });

    const rows = sheet.getRange(2, 1, lastRow - 1, CITAS_COLS.NOTAS).getValues();
    const idx  = rows.findIndex(r => r[CITAS_COLS.ID - 1] === data.citaId);
    if (idx === -1) return jsonResponse({ success: false, error: 'Cita no encontrada' });

    const rowNum = idx + 2; // +1 header, +1 1-indexed
    sheet.getRange(rowNum, CITAS_COLS.EQUIPO).setValue(data.equipo || '');
    sheet.getRange(rowNum, CITAS_COLS.STATUS).setValue(STATUS.ASIGNADA);
    sheet.getRange(rowNum, CITAS_COLS.LINK_DOCS).setValue(data.linkDocs || '');
    sheet.getRange(rowNum, CITAS_COLS.TS_ASIGNACION).setValue(new Date().toISOString());

    // Notificación Slack
    _notifySlackCita('asignada', {
      ha: rows[idx][CITAS_COLS.HA - 1],
      equipo: data.equipo,
      inicio: rows[idx][CITAS_COLS.H_INICIO - 1]
    });

    return jsonResponse({ success: true, citaId: data.citaId, equipo: data.equipo });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── POST: técnico actualiza status ─────────────────────────────────
function updateCitaStatusData(data) {
  try {
    const sheet   = ensureCitasSheet();
    const lastRow = sheet.getLastRow();
    const rows    = sheet.getRange(2, 1, lastRow - 1, CITAS_COLS.NOTAS).getValues();
    const idx     = rows.findIndex(r => r[CITAS_COLS.ID - 1] === data.citaId);
    if (idx === -1) return jsonResponse({ success: false, error: 'Cita no encontrada' });

    const rowNum  = idx + 2;
    const now     = new Date().toISOString();
    const newStatus = data.status;

    sheet.getRange(rowNum, CITAS_COLS.STATUS).setValue(newStatus);

    if (newStatus === STATUS.CAPTURADA)  sheet.getRange(rowNum, CITAS_COLS.TS_CAPTURA).setValue(now);
    if (newStatus === STATUS.EN_TRABAJO) sheet.getRange(rowNum, CITAS_COLS.TS_INICIO).setValue(now);
    if ([STATUS.FINALIZADA_OK, STATUS.FINALIZADA_NO_OK, STATUS.CLIENTE_AUSENTE,
         STATUS.RECITAR, STATUS.PARALIZADA].includes(newStatus)) {
      sheet.getRange(rowNum, CITAS_COLS.TS_FINAL).setValue(now);
      if (data.notas) sheet.getRange(rowNum, CITAS_COLS.NOTAS).setValue(data.notas);
    }

    return jsonResponse({ success: true, citaId: data.citaId, status: newStatus });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── Helper: normalizar fecha → 'yyyy-MM-dd' (Sheets devuelve Date objects) ──
function _toDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Europe/Berlin', 'yyyy-MM-dd');
  return String(val).substring(0, 10);
}

// ─── Helper: leer citas del calendario (sin Sheet) ──────────────────
function _readCalendarCitas(dateStr) {
  const tz    = 'Europe/Berlin';
  // Construir rango en hora de Berlin para no perder eventos por UTC offset
  const parts = dateStr.split('-').map(Number);
  const startDate = new Date(parts[0], parts[1]-1, parts[2],  0,  0,  0);
  const endDate   = new Date(parts[0], parts[1]-1, parts[2], 23, 59, 59);
  const citas     = [];

  try {
    const calendars = CalendarApp.getAllCalendars();
    Logger.log('Calendarios encontrados: ' + calendars.length);

    for (const cal of calendars) {
      const events = cal.getEvents(startDate, endDate);
      Logger.log('Cal "' + cal.getName() + '" → ' + events.length + ' eventos en ' + dateStr);

      for (const event of events) {
        const title = event.getTitle();
        Logger.log('Evento: ' + title);

        // Filtro amplio — cualquier evento que mencione WC, HA, o instalación WestConnect
        const isWC = /WC/i.test(title) || /westconnect/i.test(title) ||
                     /HA\d{5,}/i.test(title) || (/Installation/i.test(title) && /HA/i.test(title));
        if (!isWC) continue;

        const haMatch  = title.match(/HA(\d+)/i);
        const tkMatch  = title.match(/^(\d+)\s*TK/i);
        const cpMatch  = title.match(/(\d{5})\s+([\wäöüÄÖÜß\-]+)/);
        const strMatch = title.match(/\d{5}\s+[\wäöüÄÖÜß\-]+[-\s]+(.+)$/);

        citas.push({
          calEventId:  event.getId(),
          ha:          haMatch  ? 'HA' + haMatch[1]    : title.substring(0, 30),
          technicians: tkMatch  ? parseInt(tkMatch[1]) : 0,
          start:       Utilities.formatDate(event.getStartTime(), tz, 'HH:mm'),
          end:         Utilities.formatDate(event.getEndTime(),   tz, 'HH:mm'),
          postalCode:  cpMatch  ? cpMatch[1]           : '',
          city:        cpMatch  ? cpMatch[2]           : '',
          street:      strMatch ? strMatch[1].replace(/-+/g, ' ').trim() : ''
        });
      }
    }
  } catch (err) {
    Logger.log('ERROR _readCalendarCitas: ' + err.toString());
    throw err;
  }

  citas.sort((a, b) => a.start.localeCompare(b.start));
  Logger.log('Total citas WC encontradas: ' + citas.length);
  return citas;
}

// ─── Función de diagnóstico (ejecutar manualmente en Apps Script) ────
function testCitasHoy() {
  const tz      = 'Europe/Berlin';
  const dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  Logger.log('=== TEST CITAS === Fecha: ' + dateStr);

  const citas = _readCalendarCitas(dateStr);
  Logger.log('Citas encontradas: ' + JSON.stringify(citas));

  const sheet = ensureCitasSheet();
  Logger.log('Hoja Citas existe: ' + (sheet ? 'SÍ' : 'NO'));
}

// ─── Helper: notificación Slack ──────────────────────────────────────
function _notifySlackCita(event, info) {
  try {
    const msgs = {
      asignada: `📋 *Cita asignada* — ${info.ha} → *${info.equipo}* a las ${info.inicio}`
    };
    if (!msgs[event] || !CONFIG.SLACK_WEBHOOK_URL.startsWith('https')) return;
    UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ text: msgs[event] }), muteHttpExceptions: true
    });
  } catch (_) {}
}

// ============================================
// FUNCIONES DE PRUEBA
// ============================================
