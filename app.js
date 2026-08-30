(async function () {
  const fallbackData = window.SAHMT_DATA;
  const contactsPayload = window.SAHMT_CONTACTS;
  const fallbackNoticesPayload = {
    activeId: "aviso-seguranca",
    notices: [
      {
        id: "aviso-seguranca",
        eyebrow: "Comunicado SAHMT",
        title: "Aviso SAHMT",
        message: "A configuracao de avisos precisa ser revisada no arquivo notices.js."
      }
    ]
  };
  const noticesPayload = window.SAHMT_NOTICES || fallbackNoticesPayload;
  const skipOpeningNotice = new URLSearchParams(window.location.search).get("skipNotice") === "1";

  const siglaPattern = /(?:[A-Z]{2}|L2)(?:[/-](?:[A-Z]{2}|L2))*/g;
  const contacts = Array.isArray(contactsPayload?.records) ? contactsPayload.records : [];
  const contactsBySigla = new Map(contacts.map((contact) => [contact.sigla, contact]));
  const siglaAliases = new Map([
    ["DC", ["AD", "CR", "LA", "LH"]]
  ]);
  const dcAliasesByWeekday = new Map([
    ["Segunda", ["CR", "LH"]],
    ["Terca", ["CR", "LH", "AD"]],
    ["Quarta", ["CR", "LH", "AD"]],
    ["Quinta", ["CR", "LH"]],
    ["Sexta", ["CR", "LA"]]
  ]);
  const scheduleSpreadsheetId = "11ayJbQFmFPzLegFZHL8kPKCvudpPo60O4NyR3i7aofA";
  const scheduleSheetSources = [
    ["SEGUNDA 2026", "Segunda"],
    ["TERCA 2026", "Terca"],
    ["QUARTA 2026", "Quarta"],
    ["QUINTA 2026", "Quinta"],
    ["SEXTA 2026", "Sexta"],
    ["SABADO 2026", "Sabado"],
    ["DOMINGO 2026", "Domingo"]
  ];
  const vacationSheetTitle = "FERIAS 2026";
  const defaultSiteUrl = fallbackData?.siteUrl || "https://sites.google.com/view/sahmt/in%C3%ADcio";
  const managementSiteUrl = "./apps/gestao/";
  const eventsUrl = "./apps/eventos/";
  const labelsUrl = "./apps/etiquetas/";
  const syncConfig = window.SAHMT_SYNC_CONFIG || {};
  const siglaStateStorageKey = "sahmt-sigla-checks-v1";
  const clientIdStorageKey = "sahmt-client-id-v1";
  const sharedStateEndpoint = normalizeEndpoint(syncConfig.endpoint);
  const syncPollIntervalMs = Number(syncConfig.pollIntervalMs) > 0 ? Number(syncConfig.pollIntervalMs) : 20000;
  const sharedPendingTtlMs = Number(syncConfig.pendingTtlMs) > 0 ? Number(syncConfig.pendingTtlMs) : 180000;

  const todayKey = formatKey(new Date());
  const siglaCheckState = loadSiglaCheckState();
  const clientId = getOrCreateClientId();
  let data = null;
  let byDate = new Map();
  let orderedDates = [];
  let deferredInstallPrompt = null;
  let sharedStateHash = serializeSiglaState(siglaCheckState);
  let sharedStateTimer = null;
  const pendingSharedUpdates = new Map();

  const elements = {
    dateInput: document.getElementById("dateInput"),
    prevButton: document.getElementById("prevButton"),
    todayButton: document.getElementById("todayButton"),
    nextButton: document.getElementById("nextButton"),
    installButton: document.getElementById("installButton"),
    pageShell: document.querySelector(".page-shell"),
    appFrame: document.querySelector(".app-frame"),
    emptyState: document.getElementById("emptyState"),
    siglasGrid: document.getElementById("siglasGrid"),
    vacationCard: document.getElementById("vacationCard"),
    siteBanner: document.getElementById("siteBanner"),
    eventsLauncher: document.getElementById("eventsLauncher"),
    eventsModal: document.getElementById("eventsModal"),
    eventsBackdrop: document.getElementById("eventsBackdrop"),
    closeEventsModal: document.getElementById("closeEventsModal"),
    eventsFrame: document.getElementById("eventsFrame"),
    labelsLauncher: document.getElementById("labelsLauncher"),
    labelsModal: document.getElementById("labelsModal"),
    labelsBackdrop: document.getElementById("labelsBackdrop"),
    closeLabelsModal: document.getElementById("closeLabelsModal"),
    labelsFrame: document.getElementById("labelsFrame"),
    managementModal: document.getElementById("managementModal"),
    managementBackdrop: document.getElementById("managementBackdrop"),
    closeManagementModal: document.getElementById("closeManagementModal"),
    managementFrame: document.getElementById("managementFrame"),
    contactModal: document.getElementById("contactModal"),
    contactBackdrop: document.getElementById("contactBackdrop"),
    closeContactModal: document.getElementById("closeContactModal"),
    contactKicker: document.getElementById("contactKicker"),
    contactTitle: document.getElementById("contactTitle"),
    contactSummary: document.getElementById("contactSummary"),
    contactList: document.getElementById("contactList"),
    noticeModal: document.getElementById("noticeModal"),
    noticeEyebrow: document.getElementById("noticeEyebrow"),
    noticeTitle: document.getElementById("noticeTitle"),
    noticeMessage: document.getElementById("noticeMessage"),
    noticeCountdown: document.getElementById("noticeCountdown"),
    closeNoticeModal: document.getElementById("closeNoticeModal")
  };

  await ensureSharedAccess();
  preloadLabelsModule();

  if (elements.closeNoticeModal) {
    elements.closeNoticeModal.addEventListener("click", closeNoticeModal);
  }

  showOpeningNotice();

  data = fallbackData;

  if (!data || !Array.isArray(data.days) || data.days.length === 0) {
    try {
      data = await loadScheduleDataWithTimeout(6000);
    } catch (error) {
      throw new Error("Dados da escala nao encontrados.");
    }
  }

  applyScheduleData(data);
  const fallbackDate = clampKey(todayKey);
  elements.dateInput.value = clampKey(fallbackDate);

  // Shared highlights must never delay the local schedule display.
  hydrateSharedSiglaState().then(() => render(elements.dateInput.value)).catch(() => {});

  elements.dateInput.addEventListener("change", () => {
    render(clampKey(elements.dateInput.value));
  });

  elements.prevButton.addEventListener("click", () => {
    render(shiftDate(elements.dateInput.value, -1));
  });

  elements.nextButton.addEventListener("click", () => {
    render(shiftDate(elements.dateInput.value, 1));
  });

  elements.todayButton.addEventListener("click", () => {
    render(clampKey(todayKey));
  });

  if (elements.installButton) {
    elements.installButton.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      elements.installButton.classList.add("hidden");
    });
  }

  if (elements.closeContactModal) {
    elements.closeContactModal.addEventListener("click", closeContactModal);
  }

  if (elements.eventsLauncher) {
    elements.eventsLauncher.addEventListener("click", openEventsModal);
  }

  if (elements.labelsLauncher) {
    elements.labelsLauncher.addEventListener("click", (event) => {
      event.preventDefault();
      openLabelsModal();
    });
  }

  if (elements.siteBanner) {
    elements.siteBanner.addEventListener("click", openManagementModal);
  }

  if (elements.closeEventsModal) {
    elements.closeEventsModal.addEventListener("click", closeEventsModal);
  }

  if (elements.eventsBackdrop) {
    elements.eventsBackdrop.addEventListener("click", closeEventsModal);
  }

  if (elements.closeLabelsModal) {
    elements.closeLabelsModal.addEventListener("click", closeLabelsModal);
  }

  if (elements.labelsBackdrop) {
    elements.labelsBackdrop.addEventListener("click", closeLabelsModal);
  }

  if (elements.closeManagementModal) {
    elements.closeManagementModal.addEventListener("click", closeManagementModal);
  }

  if (elements.managementBackdrop) {
    elements.managementBackdrop.addEventListener("click", closeManagementModal);
  }

  if (elements.contactBackdrop) {
    elements.contactBackdrop.addEventListener("click", closeContactModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEventsModal();
      closeLabelsModal();
      closeManagementModal();
      closeContactModal();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (elements.installButton) {
      elements.installButton.classList.remove("hidden");
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (elements.installButton) {
      elements.installButton.classList.add("hidden");
    }
  });

  window.addEventListener("resize", requestViewportFit);
  window.addEventListener("orientationchange", requestViewportFit);
  window.visualViewport?.addEventListener("resize", requestViewportFit);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=20260830-3", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }

  render(elements.dateInput.value);
  refreshScheduleFromSheet();

  async function ensureSharedAccess() {
    if (!window.SAHMT_AUTH?.requireAccess) {
      return;
    }

    await window.SAHMT_AUTH.requireAccess({
      moduleId: "SAHMT",
      pageId: "home",
      returnUrl: window.location.href
    });
  }

  function applyScheduleData(scheduleData) {
    data = scheduleData;
    byDate = new Map(data.days.map((day) => [day.date, day]));
    orderedDates = data.days.map((day) => day.date).sort();
    elements.dateInput.min = orderedDates[0];
    elements.dateInput.max = orderedDates[orderedDates.length - 1];
  }

  function refreshScheduleFromSheet() {
    loadScheduleDataWithTimeout(12000)
      .then((liveData) => {
        if (!Array.isArray(liveData?.days) || !liveData.days.length) {
          return;
        }

        const selectedDate = elements.dateInput.value;
        applyScheduleData(liveData);
        render(clampKey(selectedDate));
      })
      .catch(() => {});
  }

  function render(dateKey) {
    elements.dateInput.value = dateKey;
    const day = byDate.get(dateKey);
    elements.todayButton.textContent = `HOJE\n${(day?.weekdayLabel || getWeekdayLabel(dateKey)).toUpperCase()}`;

    if (!day) {
      elements.emptyState.classList.remove("hidden");
      elements.siglasGrid.innerHTML = "";
      renderVacationLabel(null);
      requestViewportFit();
      return;
    }

    elements.emptyState.classList.add("hidden");
    renderSiglas(day.siglas, day.weekdayLabel);
    renderVacationLabel(day.vacationLabel);
    requestViewportFit();
  }

  function requestViewportFit() {
    window.requestAnimationFrame(fitAppToViewport);
  }

  function fitAppToViewport() {
    const shell = elements.pageShell;
    const frame = elements.appFrame;
    if (!shell || !frame || document.body.classList.contains("modal-open")) {
      return;
    }

    frame.style.setProperty("--app-scale", "1");
    const shellStyle = window.getComputedStyle(shell);
    const availableHeight = shell.clientHeight
      - Number.parseFloat(shellStyle.paddingTop)
      - Number.parseFloat(shellStyle.paddingBottom);
    const contentHeight = frame.scrollHeight;
    const scale = contentHeight > 0 ? Math.min(1, availableHeight / contentHeight) : 1;

    frame.style.setProperty("--app-scale", String(Math.max(0, scale)));
  }

  function renderSiglas(siglas, weekdayLabel) {
    elements.siglasGrid.innerHTML = "";
    const activeDate = elements.dateInput.value;
    const vacationSiglas = getVacationSiglasForDate(activeDate);
    const vacationOrder = getVacationOrderForDate(activeDate);
    const scheduledVacationSiglas = getScheduledVacationSiglas(siglas, vacationSiglas);
    const showVacationPositions = scheduledVacationSiglas.size > 1;

    siglas.forEach((sigla, index) => {
      const item = document.createElement("div");
      item.className = "sigla-item";

      const token = document.createElement("button");
      token.className = "sigla-token sigla-button";
      token.type = "button";
      token.setAttribute("aria-label", `Abrir contato da sigla ${sigla}. Mantenha pressionado por 3 segundos para marcar ou desmarcar.`);
      token.title = "Toque para contato. Mantenha pressionado por 3 segundos para destacar.";
      bindSiglaInteractions(token, sigla, activeDate);

      const dcVacationSiglas = getDcVacationSiglas(sigla, vacationSiglas, weekdayLabel);
      appendSiglaDisplay(token, sigla, vacationSiglas, vacationOrder, showVacationPositions);

      if (dcVacationSiglas.length) {
        token.appendChild(document.createTextNode(" - "));
        dcVacationSiglas.forEach((vacationSigla, position) => {
          if (position > 0) {
            token.appendChild(document.createTextNode(", "));
          }

          token.appendChild(
            createVacationSiglaNode(
              vacationSigla,
              "dc-vacation-sigla",
              getVacationPosition(vacationSigla, vacationOrder, showVacationPositions)
            )
          );
        });
      }

      if (isWholeSiglaOnVacation(sigla, vacationSiglas)) {
        token.classList.add("sigla-token--vacation");
      }

      if (isSiglaChecked(activeDate, sigla)) {
        token.classList.add("sigla-token--checked");
        token.setAttribute("aria-pressed", "true");
      }

      const counter = document.createElement("div");
      counter.className = "sigla-index";
      counter.textContent = String(index + 1);

      item.appendChild(token);
      item.appendChild(counter);
      elements.siglasGrid.appendChild(item);
    });
  }

  function bindSiglaInteractions(token, sigla, dateKey) {
    const holdDurationMs = 3000;
    let holdTimer = null;
    let holdCompleted = false;
    let activePointerId = null;
    let pressStartedAt = 0;

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      token.classList.remove("sigla-button--pressing");
    };

    token.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }

      event.preventDefault();
      holdCompleted = false;
      activePointerId = event.pointerId;
      pressStartedAt = performance.now();
      token.classList.add("sigla-button--pressing");
      holdTimer = window.setTimeout(async () => {
        holdTimer = null;
        holdCompleted = true;
        token.classList.remove("sigla-button--pressing");
        await toggleSiglaCheck(token, dateKey, sigla);
      }, holdDurationMs);
    });

    token.addEventListener("pointerup", (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }

      // A long press is exclusive. The elapsed-time fallback covers mobile
      // browsers that dispatch pointerup immediately before a busy timer runs.
      const wasLongPress = holdCompleted || performance.now() - pressStartedAt >= holdDurationMs - 120;
      clearHold();
      activePointerId = null;
      pressStartedAt = 0;

      if (!wasLongPress) {
        openTokenDetails(sigla);
      }
    });

    token.addEventListener("pointercancel", () => {
      activePointerId = null;
      pressStartedAt = 0;
      clearHold();
    });
    token.addEventListener("contextmenu", (event) => event.preventDefault());
    token.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openTokenDetails(sigla);
      }
    });
  }

  async function toggleSiglaCheck(token, dateKey, sigla) {
    const marked = !token.classList.contains("sigla-token--checked");
    applySiglaCheckAppearance(token, marked);

    if (!dateKey || !sigla) {
      return;
    }

    updateSiglaCheckState(dateKey, sigla, marked);
    persistSiglaCheckState();
    registerPendingSharedUpdate(dateKey, sigla, marked);

    if (!sharedStateEndpoint) {
      return;
    }

    try {
      const remoteState = await pushSharedSiglaCheck(dateKey, sigla, marked);
      if (remoteState) {
        replaceSiglaCheckState(remoteState);
        render(elements.dateInput.value);
      }
    } catch (error) {
      // Keep the local optimistic state when the shared sync endpoint is unavailable.
    }
  }

  function isSiglaChecked(dateKey, sigla) {
    return Array.isArray(siglaCheckState[dateKey]) && siglaCheckState[dateKey].includes(sigla);
  }

  function loadSiglaCheckState() {
    try {
      const raw = window.localStorage.getItem(siglaStateStorageKey);

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveSiglaCheckState() {
    try {
      window.localStorage.setItem(siglaStateStorageKey, JSON.stringify(siglaCheckState));
    } catch (error) {
      // Ignore storage failures to avoid blocking the UI on restricted browsers.
    }
  }

  function applySiglaCheckAppearance(token, marked) {
    token.classList.toggle("sigla-token--checked", marked);
    token.setAttribute("aria-pressed", marked ? "true" : "false");
  }

  function updateSiglaCheckState(dateKey, sigla, marked) {
    if (marked) {
      if (!Array.isArray(siglaCheckState[dateKey])) {
        siglaCheckState[dateKey] = [];
      }

      if (!siglaCheckState[dateKey].includes(sigla)) {
        siglaCheckState[dateKey].push(sigla);
      }
    } else if (Array.isArray(siglaCheckState[dateKey])) {
      siglaCheckState[dateKey] = siglaCheckState[dateKey].filter((value) => value !== sigla);

      if (siglaCheckState[dateKey].length === 0) {
        delete siglaCheckState[dateKey];
      }
    }
  }

  function persistSiglaCheckState() {
    sharedStateHash = serializeSiglaState(siglaCheckState);
    saveSiglaCheckState();
  }

  async function hydrateSharedSiglaState() {
    if (!sharedStateEndpoint) {
      return;
    }

    try {
      const remoteState = await fetchSharedSiglaState();
      if (remoteState) {
        replaceSiglaCheckState(remoteState);
      }
      startSharedStatePolling();
    } catch (error) {
      // If the endpoint is not configured or temporarily unavailable, keep local behavior.
    }
  }

  function startSharedStatePolling() {
    if (!sharedStateEndpoint || sharedStateTimer) {
      return;
    }

    sharedStateTimer = window.setInterval(async () => {
      try {
        const remoteState = await fetchSharedSiglaState();
        const mergedState = mergeSharedState(remoteState);
        const nextHash = serializeSiglaState(mergedState);

        if (nextHash && nextHash !== sharedStateHash) {
          replaceSiglaCheckState(mergedState);
          render(elements.dateInput.value);
        }
      } catch (error) {
        // Polling should fail silently to avoid interrupting the app UX.
      }
    }, syncPollIntervalMs);
  }

  async function fetchSharedSiglaState() {
    const url = new URL(sharedStateEndpoint);
    url.searchParams.set("spreadsheetId", scheduleSpreadsheetId);
    url.searchParams.set("sheetName", "DESTAQUES APP");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao sincronizar destaques: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeSharedState(payload?.highlights);
  }

  async function pushSharedSiglaCheck(dateKey, sigla, marked) {
    const url = new URL(sharedStateEndpoint);
    const authUser = String(window.SAHMT_AUTH?.getUserLabel?.() || "").trim();
    // The server receives the intended state, not an ambiguous toggle. This
    // makes unmarking persistent across every device that reads the sheet.
    url.searchParams.set("action", "set");
    url.searchParams.set("spreadsheetId", scheduleSpreadsheetId);
    url.searchParams.set("sheetName", "DESTAQUES APP");
    url.searchParams.set("date", dateKey);
    url.searchParams.set("sigla", sigla);
    url.searchParams.set("marked", marked ? "true" : "false");
    url.searchParams.set("updatedBy", authUser || clientId);
    url.searchParams.set("source", "PWA");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao gravar destaque compartilhado: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeSharedState(payload?.highlights);
  }

  function replaceSiglaCheckState(nextState) {
    const mergedState = mergeSharedState(nextState);
    Object.keys(siglaCheckState).forEach((key) => delete siglaCheckState[key]);
    Object.entries(mergedState).forEach(([dateKey, siglas]) => {
      siglaCheckState[dateKey] = siglas;
    });
    persistSiglaCheckState();
  }

  function normalizeSharedState(rawState) {
    if (!rawState || typeof rawState !== "object") {
      return {};
    }

    return Object.entries(rawState).reduce((accumulator, [dateKey, siglas]) => {
      const normalizedDateKey = normalizeRemoteSharedDateKey(dateKey);
      if (!normalizedDateKey) {
        return accumulator;
      }

      if (!Array.isArray(siglas)) {
        return accumulator;
      }

      const normalizedSiglas = Array.from(
        new Set(
          siglas
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );

      if (normalizedSiglas.length) {
        accumulator[normalizedDateKey] = normalizedSiglas;
      }

      return accumulator;
    }, {});
  }

  function serializeSiglaState(state) {
    return JSON.stringify(
      Object.keys(state || {})
        .sort()
        .reduce((accumulator, dateKey) => {
          accumulator[dateKey] = [...(state[dateKey] || [])].sort();
          return accumulator;
        }, {})
    );
  }

  function registerPendingSharedUpdate(dateKey, sigla, marked) {
    pendingSharedUpdates.set(buildPendingKey(dateKey, sigla), {
      dateKey,
      sigla,
      marked,
      createdAt: Date.now()
    });
  }

  function mergeSharedState(rawState) {
    const baseState = normalizeSharedState(rawState);
    const now = Date.now();

    pendingSharedUpdates.forEach((entry, key) => {
      if (now - entry.createdAt > sharedPendingTtlMs) {
        pendingSharedUpdates.delete(key);
        return;
      }

      const isReflected = entry.marked
        ? stateHasSigla(baseState, entry.dateKey, entry.sigla)
        : !stateHasSigla(baseState, entry.dateKey, entry.sigla);

      if (isReflected) {
        pendingSharedUpdates.delete(key);
        return;
      }

      if (entry.marked) {
        if (!Array.isArray(baseState[entry.dateKey])) {
          baseState[entry.dateKey] = [];
        }

        if (!baseState[entry.dateKey].includes(entry.sigla)) {
          baseState[entry.dateKey].push(entry.sigla);
          baseState[entry.dateKey].sort();
        }
      } else if (Array.isArray(baseState[entry.dateKey])) {
        baseState[entry.dateKey] = baseState[entry.dateKey].filter((value) => value !== entry.sigla);
        if (baseState[entry.dateKey].length === 0) {
          delete baseState[entry.dateKey];
        }
      }
    });

    return baseState;
  }

  function stateHasSigla(state, dateKey, sigla) {
    return Array.isArray(state[dateKey]) && state[dateKey].includes(sigla);
  }

  function buildPendingKey(dateKey, sigla) {
    return `${dateKey}::${String(sigla || "").toUpperCase()}`;
  }

  function normalizeRemoteSharedDateKey(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return text;
    }

    const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return formatKey(parsed);
  }

  function getOrCreateClientId() {
    try {
      const stored = window.localStorage.getItem(clientIdStorageKey);
      if (stored) {
        return stored;
      }

      const created = `client-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(clientIdStorageKey, created);
      return created;
    } catch (error) {
      return `client-${Date.now()}`;
    }
  }

  function normalizeEndpoint(value) {
    const trimmed = String(value || "").trim();
    return trimmed || "";
  }

  function renderVacationLabel(label) {
    toggle(elements.vacationCard, true);
  }

  function getVacationSiglasForDate(dateKey) {
    return new Set(getVacationOrderForDate(dateKey));
  }

  function getVacationOrderForDate(dateKey) {
    const label = String(byDate.get(dateKey)?.vacationLabel || "");
    // The vacation ranking is written before the optional note in parentheses.
    return extractSiglas(label.split("(")[0]);
  }

  function getVacationPosition(sigla, vacationOrder, showVacationPositions) {
    if (!showVacationPositions || !Array.isArray(vacationOrder) || vacationOrder.length < 2) {
      return 0;
    }

    const index = vacationOrder.indexOf(sigla);
    return index === -1 ? 0 : index + 1;
  }

  function getScheduledVacationSiglas(siglas, vacationSiglas) {
    const scheduled = new Set();

    siglas.forEach((sigla) => {
      extractSiglas(sigla).forEach((part) => {
        if (vacationSiglas.has(part)) {
          scheduled.add(part);
        }
      });
    });

    return scheduled;
  }

  function appendSiglaDisplay(token, sigla, vacationSiglas, vacationOrder, showVacationPositions) {
    const parts = String(sigla || "").toUpperCase().split(/([/-])/);
    const isCombinedSigla = parts.some((part) => part === "/" || part === "-");

    parts.forEach((part) => {
      if (!/^(?:[A-Z]{2}|L2)$/.test(part)) {
        token.appendChild(document.createTextNode(part));
        return;
      }

      const partWrap = document.createElement("span");
      partWrap.className = "sigla-token__part";

      if (vacationSiglas.has(part)) {
        partWrap.appendChild(
          createVacationSiglaNode(
            part,
            isCombinedSigla ? "sigla-token__vacation-part" : "sigla-token__vacation-label",
            getVacationPosition(part, vacationOrder, showVacationPositions)
          )
        );
      } else {
        partWrap.appendChild(document.createTextNode(part));
      }

      token.appendChild(partWrap);
    });
  }

  function createVacationSiglaNode(sigla, className, position) {
    const vacationPart = document.createElement("span");
    vacationPart.className = className;
    vacationPart.textContent = sigla;

    if (!position) {
      return vacationPart;
    }

    const wrap = document.createElement("span");
    wrap.className = "sigla-token__vacation-wrap";
    wrap.appendChild(vacationPart);

    const marker = document.createElement("span");
    marker.className = "sigla-token__position";
    marker.textContent = String(position);
    marker.setAttribute("aria-hidden", "true");
    wrap.appendChild(marker);
    return wrap;
  }

  function isWholeSiglaOnVacation(sigla, vacationSiglas) {
    if (!vacationSiglas || vacationSiglas.size === 0 || /[/-]/.test(sigla)) {
      return false;
    }

    return vacationSiglas.has(String(sigla || "").trim().toUpperCase());
  }

  function getDcVacationSiglas(sigla, vacationSiglas, weekdayLabel) {
    if (sigla !== "DC" || !vacationSiglas || vacationSiglas.size === 0) {
      return [];
    }

    return (dcAliasesByWeekday.get(weekdayLabel) || []).filter((value) => vacationSiglas.has(value));
  }

  function openTokenDetails(token) {
    const details = resolveTokenDetails(token);
    const matchedContacts = details.contacts;
    const unresolved = details.unresolved;

    elements.contactKicker.textContent = `Sigla ${token}`;
    elements.contactTitle.textContent = matchedContacts.length
      ? matchedContacts.length === 1
        ? matchedContacts[0].name
        : `Contatos vinculados a ${token}`
      : `Sigla ${token}`;
    elements.contactSummary.textContent = buildSummaryText(token, matchedContacts, unresolved);
    elements.contactList.replaceChildren(...buildContactNodes(matchedContacts, unresolved));

    elements.contactModal.classList.remove("hidden");
    elements.contactModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeContactModal() {
    elements.contactModal.classList.add("hidden");
    elements.contactModal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  }

  function openEventsModal() {
    window.SAHMT_AUTH?.track("area_open", "Eventos de Escala");
    window.location.href = new URL(eventsUrl, window.location.href).href;
  }

  function closeEventsModal() {
    elements.eventsModal.classList.add("hidden");
    elements.eventsModal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  }

  function openLabelsModal() {
    window.SAHMT_AUTH?.track("area_open", "Etiquetas");
    preloadLabelsModule();
    elements.labelsModal.classList.remove("hidden");
    elements.labelsModal.setAttribute("aria-hidden", "false");
    updateBodyModalState();
  }

  function preloadLabelsModule() {
    if (!elements.labelsFrame || elements.labelsFrame.src) {
      return;
    }

    elements.labelsFrame.src = new URL(labelsUrl, window.location.href).href;
  }

  function closeLabelsModal() {
    elements.labelsModal.classList.add("hidden");
    elements.labelsModal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  }

  function openManagementModal() {
    window.SAHMT_AUTH?.track("area_open", "Gestao");
    window.location.href = new URL(managementSiteUrl, window.location.href).href;
  }

  function closeManagementModal() {
    elements.managementModal.classList.add("hidden");
    elements.managementModal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  }

  function updateBodyModalState() {
    const hasOpenModal =
      !elements.contactModal.classList.contains("hidden") ||
      !elements.eventsModal.classList.contains("hidden") ||
      !elements.labelsModal.classList.contains("hidden") ||
      !elements.managementModal.classList.contains("hidden") ||
      !elements.noticeModal.classList.contains("hidden");
    document.body.classList.toggle("modal-open", hasOpenModal);

    if (!hasOpenModal) {
      requestViewportFit();
    }
  }

  function showOpeningNotice() {
    if (skipOpeningNotice) {
      return;
    }

    const notices = Array.isArray(noticesPayload.notices) ? noticesPayload.notices : [];
    const activeNotice = noticesPayload.activeId === null
      ? null
      : notices.find((notice) => notice.id === noticesPayload.activeId) || notices[0];

    if (!activeNotice || !elements.noticeModal) {
      return;
    }

    elements.noticeEyebrow.textContent = activeNotice.eyebrow || "Comunicado SAHMT";
    elements.noticeTitle.textContent = activeNotice.title || "Aviso";
    elements.noticeMessage.textContent = activeNotice.message || "";
    elements.closeNoticeModal.disabled = true;
    elements.noticeModal.classList.remove("hidden");
    elements.noticeModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    let remaining = 3;
    elements.noticeCountdown.textContent = `Fechamento liberado em ${remaining} segundos`;

    const countdown = window.setInterval(() => {
      remaining -= 1;

      if (remaining > 0) {
        elements.noticeCountdown.textContent = `Fechamento liberado em ${remaining} segundos`;
        return;
      }

      window.clearInterval(countdown);
      elements.noticeCountdown.textContent = "Aviso pronto para ser fechado";
      elements.closeNoticeModal.disabled = false;
    }, 1000);
  }

  function closeNoticeModal() {
    if (!elements.closeNoticeModal || elements.closeNoticeModal.disabled) {
      return;
    }

    elements.noticeModal.classList.add("hidden");
    elements.noticeModal.setAttribute("aria-hidden", "true");
    updateBodyModalState();
  }

  function buildSummaryText(token, matchedContacts, unresolved) {
    if (matchedContacts.length && !unresolved.length) {
      return matchedContacts.length === 1
        ? `Ficha de contato vinculada a ${token}.`
        : `Foram encontrados ${matchedContacts.length} contatos vinculados a ${token}.`;
    }

    if (matchedContacts.length && unresolved.length) {
      return `Foram encontrados ${matchedContacts.length} contatos para ${token}. Sem ficha nominal para: ${unresolved.join(", ")}.`;
    }

    return `Nao ha ficha de contato nominal cadastrada para ${token} nesta correlacao.`;
  }

  function buildContactNodes(matchedContacts, unresolved) {
    const nodes = matchedContacts.map((contact) => createContactCard(contact));

    if (!matchedContacts.length || unresolved.length) {
      const note = document.createElement("article");
      note.className = "contact-card contact-card--note";

      const title = document.createElement("h3");
      title.textContent = matchedContacts.length ? "Observacao" : "Sem ficha vinculada";

      const text = document.createElement("p");
      text.textContent = matchedContacts.length
        ? `Ainda nao existe correspondencia nominal para: ${unresolved.join(", ")}.`
        : "Esta sigla aparece na escala, mas nao consta como nome na relacao PDF + cadastro publico.";

      note.append(title, text);
      nodes.push(note);
    }

    return nodes;
  }

  function createContactCard(contact) {
    const card = document.createElement("article");
    card.className = "contact-card";

    const header = document.createElement("div");
    header.className = "contact-card__header";

    const titleWrap = document.createElement("div");

    const siglaBadge = document.createElement("span");
    siglaBadge.className = "contact-card__sigla";
    siglaBadge.textContent = contact.sigla;

    const name = document.createElement("h3");
    name.textContent = contact.name;

    const meta = document.createElement("p");
    meta.className = "contact-card__meta";
    meta.textContent = [contact.role, contact.scaleFormatted].filter(Boolean).join(" â€¢ ") || "Equipe SAHMT";

    titleWrap.append(siglaBadge, name, meta);
    header.appendChild(titleWrap);

    const infoGrid = document.createElement("div");
    infoGrid.className = "contact-card__grid";

    [
      ["Telefone", contact.phone || "Nao informado"],
      ["E-mail", contact.email || "Nao informado"],
      ["CRM", contact.crm ? String(contact.crm) : "Nao informado"],
      ["Entrada", contact.entryDateFormatted || "Nao informado"]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "contact-card__field";

      const fieldLabel = document.createElement("span");
      fieldLabel.className = "contact-card__label";
      fieldLabel.textContent = label;

      const fieldValue = document.createElement("strong");
      fieldValue.className = "contact-card__value";
      fieldValue.textContent = value;

      row.append(fieldLabel, fieldValue);
      infoGrid.appendChild(row);
    });

    const actions = document.createElement("div");
    actions.className = "contact-card__actions";

    if (contact.whatsAppLink) {
      actions.appendChild(createActionLink("WhatsApp", contact.whatsAppLink));
    }

    if (contact.phoneDigits) {
      actions.appendChild(createActionLink("Ligar", `tel:${contact.phoneDigits}`));
    }

    if (contact.email) {
      actions.appendChild(createActionLink("E-mail", `mailto:${contact.email}`));
    }

    card.append(header, infoGrid, actions);
    return card;
  }

  function createActionLink(label, href) {
    const link = document.createElement("a");
    link.className = "contact-card__action";
    link.href = href;
    link.target = href.startsWith("http") ? "_blank" : "_self";
    link.rel = href.startsWith("http") ? "noopener noreferrer" : "";
    link.textContent = label;
    return link;
  }

  function resolveTokenDetails(token) {
    const parts = extractSiglas(token);
    const contactsFound = [];
    const seen = new Set();
    const unresolved = [];

    parts.forEach((part) => {
      const contact = contactsBySigla.get(part);
      if (contact) {
        if (!seen.has(part)) {
          seen.add(part);
          contactsFound.push(contact);
        }
      } else {
        unresolved.push(part);
      }
    });

    if (!parts.length && token) {
      unresolved.push(token);
    }

    return { contacts: contactsFound, unresolved };
  }

  function extractSiglas(token) {
    const normalized = String(token || "").toUpperCase();
    if (siglaAliases.has(normalized)) {
      return [...siglaAliases.get(normalized)];
    }

    const matches = normalized.match(siglaPattern);
    if (!matches) {
      return [];
    }

    return matches
      .flatMap((value) => value.split(/[/-]/))
      .flatMap((value) => (siglaAliases.has(value) ? siglaAliases.get(value) : [value]))
      .filter(Boolean);
  }

  function shiftDate(dateKey, delta) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + delta);
    return clampKey(formatKey(date));
  }

  function clampKey(dateKey) {
    if (dateKey < orderedDates[0]) {
      return orderedDates[0];
    }
    if (dateKey > orderedDates[orderedDates.length - 1]) {
      return orderedDates[orderedDates.length - 1];
    }
    return dateKey;
  }

  function formatKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatShort(dateKey) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(`${dateKey}T12:00:00`));
  }

  function formatLong(dateKey) {
    const value = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date(`${dateKey}T12:00:00`));

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getWeekdayLabel(dateKey) {
    const value = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
      .format(new Date(`${dateKey}T12:00:00`));
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function toggle(element, show) {
    element.classList.toggle("hidden", !show);
  }

  async function loadScheduleData() {
    const scheduleDays = [];
    const vacationData = await loadVacationData();
    const vacationsByDate = buildVacationLookup(vacationData.vacations);
    const scheduleRowsBySource = await Promise.all(
      scheduleSheetSources.map(async ([sheetTitle, weekdayLabel]) => ({
        weekdayLabel,
        rows: await fetchScheduleSheetRows(sheetTitle)
      }))
    );

    for (const { weekdayLabel, rows } of scheduleRowsBySource) {
      if (!rows.length) {
        continue;
      }

      rows.forEach((row) => {
        const date = normalizeSheetDate(row[0]);
        if (!date) {
          return;
        }

        const siglas = row
          .slice(1)
          .map((value) => String(value || "").trim())
          .filter(Boolean);

        if (!siglas.length) {
          return;
        }

        scheduleDays.push({
          date,
          weekdayLabel,
          siglas,
          // Once the live vacation tab was obtained, it is the source of truth.
          vacationLabel: vacationsByDate.get(date) || null
        });
      });
    }

    if (!scheduleDays.length) {
      if (fallbackData?.days?.length) {
        return fallbackData;
      }

      throw new Error("Nao foi possivel carregar as escalas da planilha.");
    }

    scheduleDays.sort((left, right) => left.date.localeCompare(right.date));

    return {
      appName: fallbackData?.appName || "SAHMT",
      siteUrl: defaultSiteUrl,
      days: scheduleDays,
      vacations: vacationData.vacations
    };
  }

  function loadScheduleDataWithTimeout(timeoutMs) {
    return Promise.race([
      loadScheduleData(),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Tempo esgotado ao atualizar a escala.")), timeoutMs);
      })
    ]);
  }

  async function loadVacationData() {
    const fallbackVacations = Array.isArray(fallbackData?.vacations) ? fallbackData.vacations : [];
    let rows = [];

    try {
      rows = await fetchVacationSheetRows();
    } catch (error) {
      return { vacations: fallbackVacations };
    }

    const vacations = rows
      .map((row) => {
        const start = normalizeSheetDate(row[2]);
        const end = normalizeSheetDate(row[3]);
        const label = String(row[4] || "").trim();

        if (!start || !end || !label) {
          return null;
        }

        return { start, end, label };
      })
      .filter(Boolean);

    return {
      vacations: vacations.length ? vacations : fallbackVacations
    };
  }

  async function fetchScheduleSheetRows(sheetTitle) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${scheduleSpreadsheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    url.searchParams.set("sheet", sheetTitle);
    url.searchParams.set("range", "A3:R400");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar aba ${sheetTitle}: ${response.status}`);
    }

    const csvText = await response.text();
    return parseCsvRows(csvText).filter((row) => row.some((cell) => String(cell || "").trim()));
  }

  async function fetchVacationSheetRows() {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${scheduleSpreadsheetId}/gviz/tq`);
    url.searchParams.set("tqx", "out:csv");
    url.searchParams.set("sheet", vacationSheetTitle);
    url.searchParams.set("range", "A3:F80");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar aba ${vacationSheetTitle}: ${response.status}`);
    }

    const csvText = await response.text();
    return parseCsvRows(csvText).filter((row) => {
      const month = String(row[0] || "").trim();
      const start = String(row[2] || "").trim();
      const end = String(row[3] || "").trim();
      const label = String(row[4] || "").trim();
      return Boolean(month && start && end && label);
    });
  }

  function buildVacationLookup(vacations) {
    const lookup = new Map();

    vacations.forEach((vacation) => {
      const startDate = new Date(`${vacation.start}T12:00:00`);
      const endDate = new Date(`${vacation.end}T12:00:00`);

      for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
        lookup.set(formatKey(cursor), vacation.label);
      }
    });

    return lookup;
  }

  function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
      const char = csvText[index];
      const nextChar = csvText[index + 1];

      if (char === "\"") {
        if (insideQuotes && nextChar === "\"") {
          cell += "\"";
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === "," && !insideQuotes) {
        row.push(cell.trim());
        cell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index += 1;
        }

        row.push(cell.trim());
        if (row.some((value) => value !== "")) {
          rows.push(row);
        }
        row = [];
        cell = "";
        continue;
      }

      cell += char;
    }

    if (cell.length || row.length) {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
    }

    return rows;
  }

  function normalizeSheetDate(value) {
    const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return null;
    }

    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
})();
