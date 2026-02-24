// ============================================
// UMTELKOMD FIELD REPORT — GOOGLE APPS SCRIPT
// Backend completo con tus datos configurados
// ============================================

// CONFIGURACIÓN — Ya con tus datos
const CONFIG = {
  SHEET_ID: '19gmi3TLzhlsfq5K_l5-T1EmDt7EheTkouqMEFcUYPUw',
  DRIVE_FOLDER_ID: '1mWM8W6iQdm8NC6SvoJUnxU1Rtz7KO0nT',
  SLACK_WEBHOOK_URL: 'YOUR_SLACK_WEBHOOK_URL',
  MAX_PHOTO_SIZE: 10 * 1024 * 1024 // 10 MB
};

// ============================================
// ENDPOINT PRINCIPAL — Recibe formularios
// ============================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ─── Acciones de Citas ───────────────────────────────────────────
    if (data.action === 'assignCita')       return assignCitaData(data);
    if (data.action === 'updateCitaStatus') return updateCitaStatusData(data);
    if (data.action === 'syncCitas')        return syncCitasFromCalendar(data);

    // Validar datos
    if (!isValidSubmission(data)) {
      return jsonResponse({ success: false, error: 'Datos del formulario incompletos o inválidos' });
    }

    // Guardar en Google Sheets
    const sheetResult = saveToSheet(data);

    // Subir fotos a Google Drive
    let photoResult = { count: 0, folderUrl: '' };
    if (data.photos && Object.keys(data.photos).length > 0) {
      photoResult = uploadPhotos(data);
    }

    // Subir protocolos (Westconnect)
    if (data.protocolFiles && Object.keys(data.protocolFiles).length > 0) {
      uploadProtocols(data);
    }

    // Actualizar enlace de Drive en la hoja
    if (photoResult.folderUrl) {
      updateDriveLink(data, sheetResult.row, photoResult.folderUrl);
    }

    // Enviar notificación a Slack
    sendSlackNotification(data, photoResult);

    return jsonResponse({
      success: true,
      submissionId: Utilities.getUuid(),
      row: sheetResult.row,
      photoCount: photoResult.count,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log('Error en doPost: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// Permitir GET — Dashboard y pruebas
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getData') {
    return getDashboardData();
  }

  if (action === 'getConfig') {
    return getConfigData();
  }

  if (action === 'getReports') {
    return getReportsData(e.parameter);
  }

  if (action === 'getCitas') {
    return getCitasData(e.parameter);
  }

  if (action === 'getCitasByTeam') {
    return getCitasByTeamData(e.parameter);
  }

  if (action === 'getAllCitas') {
    return getAllCitasData(e.parameter);
  }

  if (action === 'getLiveCitas') {
    return getLiveCitasData(e.parameter);
  }

  // Write actions via GET (POST has auth redirect issues on some deployments)
  if (action === 'assignCita') {
    return assignCitaData(e.parameter);
  }

  if (action === 'updateCitaStatus') {
    return updateCitaStatusData(e.parameter);
  }

  return jsonResponse({
    status: 'online',
    message: 'Umtelkomd Field Report Backend activo',
    timestamp: new Date().toISOString()
  });
}

// ============================================
// CITAS — Lee eventos WestConnect del Calendario
// ============================================

function getCitasData(params) {
  try {
    const tz = 'Europe/Berlin';
    const dateStr = (params && params.date)
      ? params.date
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    const startDate = new Date(dateStr + 'T00:00:00');
    const endDate   = new Date(dateStr + 'T23:59:59');

    const citas = [];
    const calendars = CalendarApp.getAllCalendars();

    for (const cal of calendars) {
      const events = cal.getEvents(startDate, endDate);
      for (const event of events) {
        const title = event.getTitle();
        // Filtrar sólo eventos WestConnect
        if (!/WC|Westconnect/i.test(title) && !/Installation.*HA/i.test(title)) continue;

        const haMatch  = title.match(/HA(\d+)/i);
        const tkMatch  = title.match(/^(\d+)\s*TK/i);
        const cpMatch  = title.match(/(\d{5})\s+([\wäöüÄÖÜß-]+)/);
        const strMatch = title.match(/\d{5}\s+[\wäöüÄÖÜß-]+[-\s]+(.+)$/);

        citas.push({
          id:          event.getId(),
          title:       title,
          ha:          haMatch  ? 'HA' + haMatch[1]    : '',
          technicians: tkMatch  ? parseInt(tkMatch[1]) : 0,
          start:       Utilities.formatDate(event.getStartTime(), tz, 'HH:mm'),
          end:         Utilities.formatDate(event.getEndTime(),   tz, 'HH:mm'),
          postalCode:  cpMatch  ? cpMatch[1]  : '',
          city:        cpMatch  ? cpMatch[2]  : '',
          street:      strMatch ? strMatch[1].replace(/-+/g, ' ').trim() : '',
          description: event.getDescription() || ''
        });
      }
    }

    citas.sort((a, b) => a.start.localeCompare(b.start));

    return jsonResponse({ success: true, citas: citas, date: dateStr, count: citas.length });

  } catch (err) {
    Logger.log('getCitasData error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString(), citas: [] });
  }
}

// ============================================
// REPORTS — Endpoint unificado para Admin Dashboard
// ============================================

function getReportsData(params) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const reports = [];

  // Status reverse map (sheet has Spanish labels)
  const statusReverseMap = {
    'Finalizada OK': 'completed-ok',
    'Cliente Ausente': 'client-absent',
    'Estados Previos': 'previous-states',
    'Cliente Recitar': 'client-reschedule',
    'Paralizada': 'on-hold',
    'Preinstalada': 'preinstalled',
    'Finalizada No OK': 'completed-not-ok'
  };

  // Read Glasfaser sheet
  const gSheet = spreadsheet.getSheetByName('Glasfaser');
  if (gSheet && gSheet.getLastRow() > 1) {
    const gHeaders = gSheet.getRange(1, 1, 1, gSheet.getLastColumn()).getValues()[0];
    const gData = gSheet.getRange(2, 1, gSheet.getLastRow() - 1, gSheet.getLastColumn()).getValues();
    gData.forEach(row => {
      const obj = {};
      gHeaders.forEach((h, i) => { obj[h] = row[i]; });
      reports.push({
        timestamp: obj['Timestamp'] || '',
        team: obj['Equipo'] || '',
        technician: obj['Técnico'] || '',
        supportTeam: obj['Eq. Apoyo'] || '',
        date: formatSheetDate(obj['Fecha']),
        startTime: obj['Hora Inicio'] || '',
        endTime: obj['Hora Fin'] || '',
        workStatus: statusReverseMap[obj['Estado']] || obj['Estado'] || '',
        statusLabel: obj['Estado'] || '',
        comments: obj['Observaciones'] || '',
        client: 'glasfaser-plus',
        orderNumber: obj['Nº Orden'] || '',
        ha: '',
        units: 0,
        variant: '',
        protocols: '',
        photoCount: parseInt(obj['Cant. Fotos']) || 0,
        driveUrl: obj['Enlace Drive'] || ''
      });
    });
  }

  // Read Westconnect sheet
  const wSheet = spreadsheet.getSheetByName('Westconnect');
  if (wSheet && wSheet.getLastRow() > 1) {
    const wHeaders = wSheet.getRange(1, 1, 1, wSheet.getLastColumn()).getValues()[0];
    const wData = wSheet.getRange(2, 1, wSheet.getLastRow() - 1, wSheet.getLastColumn()).getValues();
    wData.forEach(row => {
      const obj = {};
      wHeaders.forEach((h, i) => { obj[h] = row[i]; });
      reports.push({
        timestamp: obj['Timestamp'] || '',
        team: obj['Equipo'] || '',
        technician: obj['Técnico'] || '',
        supportTeam: obj['Eq. Apoyo'] || '',
        date: formatSheetDate(obj['Fecha']),
        startTime: obj['Hora Inicio'] || '',
        endTime: obj['Hora Fin'] || '',
        workStatus: statusReverseMap[obj['Estado']] || obj['Estado'] || '',
        statusLabel: obj['Estado'] || '',
        comments: obj['Observaciones'] || '',
        client: 'westconnect',
        orderNumber: '',
        ha: obj['Nº HA'] || '',
        units: parseInt(obj['Unidades']) || 0,
        variant: obj['Variante'] || '',
        protocols: obj['Protocolos'] || '',
        photoCount: parseInt(obj['Cant. Fotos']) || 0,
        driveUrl: obj['Enlace Drive'] || ''
      });
    });
  }

  // Sort by date descending
  reports.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

  return ContentService
    .createTextOutput(JSON.stringify({ 
      reports: reports,
      total: reports.length,
      lastUpdate: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatSheetDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  return String(val);
}

// ============================================
// DASHBOARD — Endpoint de datos (legacy)
// ============================================

function getDashboardData() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const result = { glasfaser: [], westconnect: [], lastUpdate: new Date().toISOString() };

  const gSheet = spreadsheet.getSheetByName('Glasfaser');
  if (gSheet && gSheet.getLastRow() > 1) {
    const gData = gSheet.getRange(2, 1, gSheet.getLastRow() - 1, gSheet.getLastColumn()).getValues();
    const gHeaders = gSheet.getRange(1, 1, 1, gSheet.getLastColumn()).getValues()[0];
    result.glasfaser = gData.map(row => {
      const obj = {};
      gHeaders.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
  }

  const wSheet = spreadsheet.getSheetByName('Westconnect');
  if (wSheet && wSheet.getLastRow() > 1) {
    const wData = wSheet.getRange(2, 1, wSheet.getLastRow() - 1, wSheet.getLastColumn()).getValues();
    const wHeaders = wSheet.getRange(1, 1, 1, wSheet.getLastColumn()).getValues()[0];
    result.westconnect = wData.map(row => {
      const obj = {};
      wHeaders.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// CONFIG — Endpoint de configuración
// ============================================

function getConfigData() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const configSheet = spreadsheet.getSheetByName('Config');

  if (!configSheet || configSheet.getLastRow() < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({ teams: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 4).getValues();

  const teamsMap = {};
  data.forEach(row => {
    const teamName = row[0];
    const pin = String(row[1]);
    const client = row[2];
    const member = row[3];

    if (!teamName) return;

    if (!teamsMap[teamName]) {
      teamsMap[teamName] = { name: teamName, pin: pin, client: client, members: [] };
    }

    if (member) {
      teamsMap[teamName].members.push(member);
    }
  });

  return ContentService
    .createTextOutput(JSON.stringify({ teams: Object.values(teamsMap) }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// VALIDACIÓN
// ============================================

function isValidSubmission(data) {
  if (!data.team || !data.client || !data.workStatus) {
    Logger.log('Validación fallida: campos básicos faltantes');
    return false;
  }

  if (data.client === 'glasfaser-plus' && !data.orderNumber) {
    Logger.log('Validación fallida: falta Nº Orden para Glasfaser Plus');
    return false;
  }

  if (data.client === 'westconnect') {
    if (!data.ha) return false;
    if (!data.units) return false;
    if (!data.variant) return false;
  }

  return true;
}

// ============================================
// GOOGLE SHEETS — Guardar datos
// ============================================

function saveToSheet(data) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheetName = data.client === 'glasfaser-plus' ? 'Glasfaser' : 'Westconnect';
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    if (data.client === 'glasfaser-plus') {
      sheet.appendRow(['Timestamp', 'Equipo', 'Técnico', 'Eq. Apoyo', 'Fecha', 'Hora Inicio', 'Hora Fin', 'Estado', 'Observaciones', 'Nº Orden', 'Cant. Fotos', 'Enlace Drive']);
    } else {
      sheet.appendRow(['Timestamp', 'Equipo', 'Técnico', 'Eq. Apoyo', 'Fecha', 'Hora Inicio', 'Hora Fin', 'Estado', 'Observaciones', 'Nº HA', 'Unidades', 'Variante', 'Protocolos', 'Cant. Fotos', 'Enlace Drive']);
    }
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#00C853').setFontColor('white');
    sheet.setFrozenRows(1);
  }

  const statusLabels = {
    'completed-ok': 'Finalizada OK',
    'client-absent': 'Cliente Ausente',
    'previous-states': 'Estados Previos',
    'client-reschedule': 'Cliente Recitar',
    'on-hold': 'Paralizada',
    'preinstalled': 'Preinstalada',
    'completed-not-ok': 'Finalizada No OK'
  };

  const statusText = statusLabels[data.workStatus] || data.workStatus;
  let photoCount = 0;
  if (data.photos) {
    for (const arr of Object.values(data.photos)) {
      if (Array.isArray(arr)) photoCount += arr.length;
    }
  }
  const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Berlin' });

  let rowData;

  if (data.client === 'glasfaser-plus') {
    rowData = [timestamp, data.team, data.technician || '', data.supportTeam || '', data.date, data.startTime, data.endTime, statusText, data.comments || '', data.orderNumber, photoCount, ''];
  } else {
    const protocols = data.protocols ? data.protocols.join(', ') : '';
    rowData = [timestamp, data.team, data.technician || '', data.supportTeam || '', data.date, data.startTime, data.endTime, statusText, data.comments || '', data.ha, data.units, data.variant, protocols, photoCount, ''];
  }

  sheet.appendRow(rowData);
  const lastRow = sheet.getLastRow();

  const statusColors = {
    'completed-ok': '#E8F5E9',
    'client-absent': '#FFF3E0',
    'previous-states': '#FFF3E0',
    'client-reschedule': '#E3F2FD',
    'on-hold': '#FFEBEE',
    'preinstalled': '#F3E5F5',
    'completed-not-ok': '#FFCDD2'
  };

  const bgColor = statusColors[data.workStatus] || '#FFFFFF';
  sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).setBackground(bgColor);

  return { row: lastRow };
}

function updateDriveLink(data, row, folderUrl) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheetName = data.client === 'glasfaser-plus' ? 'Glasfaser' : 'Westconnect';
  const sheet = spreadsheet.getSheetByName(sheetName);
  const linkCol = data.client === 'glasfaser-plus' ? 12 : 15;
  sheet.getRange(row, linkCol).setValue(folderUrl);
}

// ============================================
// GOOGLE DRIVE — Subir fotos
// ============================================

function uploadPhotos(data) {
  const parentFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const clientName = data.client === 'glasfaser-plus' ? 'Glasfaser Plus' : 'Westconnect';
  const orderId = data.client === 'glasfaser-plus' ? data.orderNumber : data.ha;

  const clientFolder = getOrCreateFolder(parentFolder, clientName);
  const dateFolder = getOrCreateFolder(clientFolder, data.date);
  const teamFolder = getOrCreateFolder(dateFolder, data.team);
  const orderFolder = getOrCreateFolder(teamFolder, orderId);

  let totalCount = 0;

  for (const [fieldName, photoArray] of Object.entries(data.photos)) {
    if (!Array.isArray(photoArray) || photoArray.length === 0) continue;

    let targetFolder = orderFolder;

    if (fieldName.startsWith('evidence')) {
      targetFolder = getOrCreateFolder(orderFolder, 'Evidencia');
    } else if (data.client === 'westconnect') {
      if (fieldName.startsWith('basement_') || fieldName.startsWith('sotano_')) {
        targetFolder = getOrCreateFolder(orderFolder, 'Sotano');
      } else if (fieldName.startsWith('housing_') || fieldName.startsWith('vivienda_')) {
        targetFolder = getOrCreateFolder(orderFolder, 'Viviendas');
      } else if (fieldName.startsWith('exterior_')) {
        targetFolder = getOrCreateFolder(orderFolder, 'Exteriores');
      }
    }

    photoArray.forEach((photoBase64, index) => {
      try {
        if (!photoBase64 || !photoBase64.includes(',')) return;
        const base64Data = photoBase64.split(',')[1];
        const mimeType = photoBase64.split(';')[0].split(':')[1] || 'image/jpeg';
        const extension = mimeType.includes('png') ? 'png' : 'jpg';
        const fileName = sanitizeFileName(fieldName) + '_' + (index + 1) + '.' + extension;
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
        targetFolder.createFile(blob);
        totalCount++;
      } catch (error) {
        Logger.log('Error subiendo foto ' + fieldName + '_' + index + ': ' + error.toString());
      }
    });
  }

  return { count: totalCount, folderUrl: orderFolder.getUrl() };
}

function uploadProtocols(data) {
  const parentFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const clientFolder = getOrCreateFolder(parentFolder, 'Westconnect');
  const dateFolder = getOrCreateFolder(clientFolder, data.date);
  const teamFolder = getOrCreateFolder(dateFolder, data.team);
  const orderFolder = getOrCreateFolder(teamFolder, data.ha || 'sin_ha');
  const protocolFolder = getOrCreateFolder(orderFolder, 'Protocolos');

  for (const [protocolName, fileBase64] of Object.entries(data.protocolFiles)) {
    try {
      if (!fileBase64 || !fileBase64.includes(',')) continue;
      const base64Data = fileBase64.split(',')[1];
      const mimeType = fileBase64.split(';')[0].split(':')[1] || 'application/pdf';
      const extension = mimeType.includes('pdf') ? 'pdf' : 'dat';
      const fileName = sanitizeFileName(protocolName) + '.' + extension;
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
      protocolFolder.createFile(blob);
    } catch (error) {
      Logger.log('Error subiendo protocolo ' + protocolName + ': ' + error.toString());
    }
  }
}

// ============================================
// SLACK — Notificaciones
// ============================================

function sendSlackNotification(data, photoResult) {
  const statusConfig = {
    'completed-ok': { emoji: '✅', label: 'FINALIZADA OK', color: '#00C853' },
    'client-absent': { emoji: '⚠️', label: 'CLIENTE AUSENTE', color: '#FF9800' },
    'previous-states': { emoji: '⚠️', label: 'ESTADOS PREVIOS', color: '#FF9800' },
    'client-reschedule': { emoji: '🔄', label: 'CLIENTE RECITAR', color: '#2196F3' },
    'on-hold': { emoji: '🔴', label: 'PARALIZADA', color: '#F44336' },
    'preinstalled': { emoji: '📦', label: 'PREINSTALADA', color: '#9C27B0' },
    'completed-not-ok': { emoji: '❌', label: 'FINALIZADA NO OK', color: '#D32F2F' }
  };

  const status = statusConfig[data.workStatus] || { emoji: '📋', label: data.workStatus, color: '#757575' };
  const clientName = data.client === 'glasfaser-plus' ? 'Glasfaser Plus' : 'Westconnect';

  const fields = [
    { title: 'Equipo', value: data.team, short: true },
    { title: 'Técnico', value: data.technician || '-', short: true },
    { title: 'Cliente', value: clientName, short: true },
    { title: 'Eq. Apoyo', value: data.supportTeam || 'Ninguno', short: true },
    { title: 'Fecha', value: data.date + ' | ' + data.startTime + ' - ' + data.endTime, short: false }
  ];

  if (data.client === 'glasfaser-plus') {
    fields.push({ title: 'Nº Orden', value: data.orderNumber, short: true });
  } else {
    fields.push({ title: 'Nº HA', value: data.ha, short: true });
    fields.push({ title: 'Unidades', value: String(data.units), short: true });
    fields.push({ title: 'Variante', value: data.variant || '-', short: true });
  }

  fields.push({ title: 'Fotos', value: String(photoResult.count || 0), short: true });
  if (data.comments) fields.push({ title: 'Observaciones', value: data.comments, short: false });
  if (photoResult.folderUrl) fields.push({ title: 'Carpeta Drive', value: '<' + photoResult.folderUrl + '|Ver fotos>', short: false });

  const payload = {
    text: status.emoji + ' *' + status.label + '* — ' + clientName,
    attachments: [{ color: status.color, fields: fields, footer: 'Umtelkomd Field Report', ts: Math.floor(Date.now() / 1000) }]
  };

  try {
    UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  } catch (error) {
    Logger.log('Error enviando a Slack: ' + error.toString());
  }
}

// ============================================
// UTILIDADES
// ============================================

function getOrCreateFolder(parentFolder, folderName) {
  const safeName = sanitizeFileName(folderName);
  const folders = parentFolder.getFoldersByName(safeName);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(safeName);
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ\-_\. ]/g, '_').substring(0, 100);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// CITAS — Gestión completa de visitas WestConnect
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
    const sheet = ensureCitasSheet();
    const now = new Date().toISOString();
    let rowNum = -1;
    let isNew = false;

    // Buscar si la cita ya existe
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const idx = rows.findIndex(r => r[0] === data.citaId);
      if (idx !== -1) rowNum = idx + 2;
    }

    // Si no existe, crear nueva fila
    if (rowNum === -1) {
      isNew = true;
      const newRow = [
        data.citaId || '',           // ID
        '',                           // CAL_EVENT_ID
        data.fecha || '',             // FECHA
        data.ha || '',                // HA
        data.direccion || '',         // DIRECCION
        data.cp || '',                // CP
        data.ciudad || '',            // CIUDAD
        data.inicio || '',            // H_INICIO
        data.fin || '',               // H_FIN
        data.tecnicos || '',          // TECNICOS
        data.equipo || '',            // EQUIPO
        STATUS.ASIGNADA,              // STATUS
        data.linkDocs || '',          // LINK_DOCS
        now,                          // TS_CREACION
        now,                          // TS_ASIGNACION
        '', '', '', ''                // TS_CAPTURA, TS_INICIO, TS_FINAL, NOTAS
      ];
      sheet.appendRow(newRow);
      rowNum = sheet.getLastRow();
    } else {
      // Actualizar fila existente
      sheet.getRange(rowNum, CITAS_COLS.EQUIPO).setValue(data.equipo || '');
      sheet.getRange(rowNum, CITAS_COLS.STATUS).setValue(STATUS.ASIGNADA);
      sheet.getRange(rowNum, CITAS_COLS.LINK_DOCS).setValue(data.linkDocs || '');
      sheet.getRange(rowNum, CITAS_COLS.TS_ASIGNACION).setValue(now);
    }

    // Notificación Slack
    _notifySlackCita('asignada', {
      ha: data.ha || data.citaId,
      equipo: data.equipo,
      inicio: data.inicio || ''
    });

    return jsonResponse({ success: true, citaId: data.citaId, equipo: data.equipo, created: isNew });
  } catch (err) {
    Logger.log('assignCitaData error: ' + err.toString());
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

function testConnection() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    Logger.log('✅ Google Sheets OK — Nombre: ' + ss.getName());
    Logger.log('   Hojas: ' + ss.getSheets().map(s => s.getName()).join(', '));
  } catch (e) { Logger.log('❌ Error Google Sheets: ' + e.toString()); }

  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    Logger.log('✅ Google Drive OK — Carpeta: ' + folder.getName());
  } catch (e) { Logger.log('❌ Error Google Drive: ' + e.toString()); }

  try {
    const response = UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ text: '🔧 *Test de conexión* — Backend conectado.' }),
      muteHttpExceptions: true
    });
    Logger.log('✅ Slack OK — Código: ' + response.getResponseCode());
  } catch (e) { Logger.log('❌ Error Slack: ' + e.toString()); }
}

// ============================================
// LIVE CITAS — Lee calendario + asignaciones en tiempo real
// ============================================

function getLiveCitasData(params) {
  try {
    const tz = 'Europe/Berlin';
    const daysAhead = parseInt(params && params.days) || 14;
    
    // 1. Leer eventos del calendario
    const today = new Date();
    const endDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    
    const calCitas = [];
    const calendars = CalendarApp.getAllCalendars();
    
    for (const cal of calendars) {
      const events = cal.getEvents(today, endDate);
      for (const event of events) {
        const title = event.getTitle();
        
        // Filtrar solo eventos WestConnect/Umtelkomd
        const isWC = /TK.*Umtelkomd.*Install.*HA/i.test(title) ||
                     /WC/i.test(title) || /westconnect/i.test(title);
        if (!isWC) continue;
        
        const startTime = event.getStartTime();
        const endTime = event.getEndTime();
        const dateStr = Utilities.formatDate(startTime, tz, 'yyyy-MM-dd');
        
        const haMatch = title.match(/HA(\d+)/i);
        const tkMatch = title.match(/^(\d+)\s*TK/i);
        const haN = haMatch ? haMatch[1] : 'NA';
        const uid = dateStr + '_' + haN;
        
        // Parsear location
        const location = event.getLocation() || '';
        const locMatch = location.match(/^(.+),\s*(\d{5})\s+([^,]+)/);
        
        calCitas.push({
          id: uid,
          calEventId: event.getId(),
          fecha: dateStr,
          ha: haMatch ? 'HA' + haN : title.substring(0, 30),
          tecnicos: tkMatch ? parseInt(tkMatch[1]) : 0,
          inicio: Utilities.formatDate(startTime, tz, 'HH:mm'),
          fin: Utilities.formatDate(endTime, tz, 'HH:mm'),
          calle: locMatch ? locMatch[1].trim() : location,
          cp: locMatch ? locMatch[2] : '',
          ciudad: locMatch ? locMatch[3].replace(/, Deutschland/i, '').trim() : '',
          titulo: title
        });
      }
    }
    
    // 2. Leer asignaciones del Sheet
    const assignments = {};
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName('Citas');
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues();
      data.forEach(row => {
        const id = row[0]; // ID column
        if (id) {
          assignments[id] = {
            equipo: row[10] || '',      // EQUIPO column (11th, 0-indexed = 10)
            status: row[11] || 'libre', // STATUS column
            linkDocs: row[12] || ''     // LINK_DOCS column
          };
        }
      });
    }
    
    // 3. Combinar calendario + asignaciones
    const seen = {};
    const citas = [];
    
    for (const c of calCitas) {
      if (seen[c.id]) continue;
      seen[c.id] = true;
      
      const a = assignments[c.id] || {};
      citas.push({
        id: c.id,
        fecha: c.fecha,
        ha: c.ha,
        tecnicos: c.tecnicos,
        inicio: c.inicio,
        fin: c.fin,
        calle: c.calle,
        cp: c.cp,
        ciudad: c.ciudad,
        titulo: c.titulo,
        equipo: a.equipo || '',
        status: a.status || 'libre',
        linkDocs: a.linkDocs || ''
      });
    }
    
    // Ordenar por fecha e inicio
    citas.sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));
    
    return jsonResponse({
      success: true,
      generated: new Date().toISOString(),
      citas: citas,
      count: citas.length
    });
    
  } catch (err) {
    Logger.log('getLiveCitasData error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString(), citas: [] });
  }
}
