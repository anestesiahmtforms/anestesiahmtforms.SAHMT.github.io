function handleAuth_(payload) {
  const user = requireAuthorized_(payload.authToken, payload.deviceToken, payload.userEmail);
  // Validation is independent from audit writes. The PWA sends a separate track action.
  const response = {
    ok: true,
    email: user.email,
    name: user.name,
    trustedDeviceExpiresAt: user.trustedDeviceExpiresAt,
  };

  return jsonResponse(response);
}

function handleTrack_(payload) {
  const user = requireAuthorized_(payload.authToken, payload.deviceToken, payload.userEmail);
  let historyRecorded=true;
  try {
  registerAccessHistory_(user, {
    eventType: payload.eventType || "page_access",
    moduleId: payload.moduleId,
    pageId: payload.pageId,
    pageTitle: payload.pageTitle,
    path: payload.path,
    embedded: payload.embedded,
    detail: payload.detail,
    deviceToken: payload.deviceToken,
    userAgent: payload.userAgent,
  });
  } catch(error) {historyRecorded=false;console.error('Falha ao registrar histórico de acesso.');}


  return jsonResponse({
    ok: true,
    historyRecorded,
    email: user.email,
    name: user.name,
  });
}

function requireAuthorized_(idToken, deviceToken, claimedEmail) {
  const normalizedDeviceToken = normalizeDeviceToken_(deviceToken);
  const normalizedClaimedEmail = normalizeEmail_(claimedEmail);

  if (String(idToken || "").trim()) {
    const googleUser = verifyGoogleIdToken_(idToken);
    if (!isAuthorizedEmail_(googleUser.email)) {
      throw centralAuthError_("FORBIDDEN","Conta Google não autorizada para o SAHMT.");
    }
    const trustedDeviceExpiresAt = registerTrustedDevice_(normalizedDeviceToken, googleUser);
    return {
      email: googleUser.email,
      name: googleUser.name || "",
      trustedDeviceExpiresAt: trustedDeviceExpiresAt,
    };
  }

  if (normalizedDeviceToken && normalizedClaimedEmail) {
    if(!isAuthorizedEmail_(normalizedClaimedEmail))throw centralAuthError_('FORBIDDEN','Conta não autorizada para o SAHMT.');
    const trustedUser = findTrustedDeviceUser_(normalizedDeviceToken, normalizedClaimedEmail);
    if (trustedUser) {
      try {if(!Number.isFinite(trustedUser.lastAccessMs)||Date.now()-trustedUser.lastAccessMs>=300000)touchTrustedDevice_(normalizedDeviceToken, normalizedClaimedEmail);}catch(error){console.error('Falha ao atualizar último acesso.');}
      return trustedUser;
    }
  }

  throw centralAuthError_("UNAUTHORIZED","Faça login com uma conta Google autorizada.");
}

function verifyGoogleIdToken_(idToken) {
  const response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(idToken || "").trim()),
    { method: "get", muteHttpExceptions: true }
  );
  const status = response.getResponseCode();
  const payload = JSON.parse(response.getContentText() || "{}");

  if (status < 200 || status >= 300) {
    throw new Error("O Google nao confirmou a conta informada.");
  }
  if (String(payload.aud || "").trim() !== GOOGLE_CLIENT_ID) {
    throw new Error("Client ID Google invalido para este app.");
  }
  if (String(payload.email_verified || "").trim() !== "true") {
    throw new Error("O e-mail Google precisa estar verificado.");
  }

  if(!['accounts.google.com','https://accounts.google.com'].includes(String(payload.iss || '')))throw centralAuthError_('UNAUTHORIZED','Emissor Google inválido.');
  if(!Number.isFinite(Number(payload.exp)) || Number(payload.exp)*1000<=Date.now())throw centralAuthError_('UNAUTHORIZED','Credencial Google expirada.');
  const email = normalizeEmail_(payload.email);
  if (!email) {
    throw new Error("A conta Google nao informou um e-mail valido.");
  }

  return {
    email: email,
    name: String(payload.name || "").trim(),
  };
}

function isAuthorizedEmail_(email) {
  return AUTHORIZED_EMAILS.indexOf(normalizeEmail_(email)) !== -1;
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeDeviceToken_(deviceToken) {
  const text = String(deviceToken || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function registerTrustedDevice_(deviceToken, user) {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{return registerTrustedDeviceUnlocked_(deviceToken,user);}finally{lock.releaseLock();}
}
function registerTrustedDeviceUnlocked_(deviceToken, user) {
  if (!deviceToken) {
    throw new Error("Dispositivo invalido para autorizacao.");
  }

  const sheet = ensureTrustedDevicesSheet_();
  const values = sheet.getDataRange().getValues();
  const now = new Date();
  const trustedUntil = new Date("9999-12-31T23:59:59Z");
  const email = normalizeEmail_(user.email);

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (normalizeDeviceToken_(row[0]) === deviceToken && normalizeEmail_(row[1]) === email) {
      if(String(row[6] || '').trim().toUpperCase()!=='ATIVO')throw centralAuthError_('REVOKED','Dispositivo revogado. Solicite a liberação ao administrador.');
      if(String(row[2] || '').trim()!==String(user.name || '').trim())sheet.getRange(rowIndex+1,3).setValue(String(user.name || '').trim());
      const lastAccess=new Date(row[4]).getTime();
      if(!Number.isFinite(lastAccess)||Date.now()-lastAccess>=300000)sheet.getRange(rowIndex+1,5).setValue(now);
      const previousExpiry=new Date(row[5]);
      if(Number.isFinite(previousExpiry.getTime())&&previousExpiry.getTime()>Date.now())return previousExpiry.toISOString();
      sheet.getRange(rowIndex+1,6).setValue(trustedUntil);
      return trustedUntil.toISOString();
    }
  }

  sheet.appendRow([
    deviceToken,
    email,
    String(user.name || "").trim(),
    now,
    now,
    trustedUntil,
    "ATIVO",
  ]);
  return trustedUntil.toISOString();
}

function findTrustedDeviceUser_(deviceToken, claimedEmail) {
  const sheet = ensureTrustedDevicesSheet_();
  const values = sheet.getDataRange().getValues();

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const savedDeviceToken = normalizeDeviceToken_(row[0]);
    const savedEmail = normalizeEmail_(row[1]);
    const expiresAt = row[5] instanceof Date ? row[5] : new Date(row[5]);
    const status = String(row[6] || "").trim().toUpperCase();

    if (savedDeviceToken !== deviceToken || savedEmail !== claimedEmail) {
      continue;
    }
    if (status !== "ATIVO") {
      throw centralAuthError_("REVOKED","Dispositivo revogado. Entre em contato com o administrador.");
    }
    if (!(expiresAt instanceof Date) || isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return null;
    }

    return {
      lastAccessMs:new Date(row[4]).getTime(),
      email: savedEmail,
      name: String(row[2] || "").trim(),
      trustedDeviceExpiresAt: expiresAt.toISOString(),
    };
  }

  return null;
}

function touchTrustedDevice_(deviceToken, email) {
  const sheet = ensureTrustedDevicesSheet_();
  const values = sheet.getDataRange().getValues();

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (normalizeDeviceToken_(row[0]) === deviceToken && normalizeEmail_(row[1]) === email) {
      const lastAccess=new Date(row[4]).getTime();
      if(!Number.isFinite(lastAccess)||Date.now()-lastAccess>=300000)sheet.getRange(rowIndex + 1, 5).setValue(new Date());
      return;
    }
  }
}

function ensureTrustedDevicesSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TRUSTED_DEVICES_SHEET);
  const headers = ["Device Token", "Email", "Nome", "Criado em", "Ultimo acesso em", "Valido ate", "Status"];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(TRUSTED_DEVICES_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function ensureAccessHistorySheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(ACCESS_HISTORY_SHEET);
  const headers = ["Timestamp", "Evento", "Email", "Nome", "Modulo", "Pagina", "Titulo", "Path", "Incorporado", "Detalhe", "Device Token", "User Agent"];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ACCESS_HISTORY_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function registerAccessHistory_(user, context) {
  const sheet = ensureAccessHistorySheet_();
  sheet.appendRow([
    new Date(),
    String(context.eventType || "page_access").trim(),
    normalizeEmail_(user.email),
    String(user.name || "").trim(),
    String(context.moduleId || "").trim(),
    String(context.pageId || "").trim(),
    String(context.pageTitle || "").trim(),
    String(context.path || "").trim(),
    String(context.embedded === true),
    String(context.detail || "").trim(),
    normalizeDeviceToken_(context.deviceToken)?'…'+normalizeDeviceToken_(context.deviceToken).slice(-8):'',
    String(context.userAgent || "").trim(),
  ]);
}


function centralAuthError_(code,message){const error=new Error(message);error.code=code;return error;}
