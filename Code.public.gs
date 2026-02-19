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

  return jsonResponse({
    status: 'online',
    message: 'Umtelkomd Field Report Backend activo',
    timestamp: new Date().toISOString()
  });
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
