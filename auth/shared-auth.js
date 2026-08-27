(function () {
  const DEFAULT_CONFIG = {
    storageKey: "sahmt-google-auth-config-v1",
    authSessionKey: "sahmt-google-auth-session-v1",
    authSessionBackupKey: "sahmt-google-auth-session-backup-v1",
    trustedDeviceKey: "sahmt-google-trusted-device-v1",
    googleClientId: "908976987584-o59p0obmvq013lg3t9726itf06e15v2c.apps.googleusercontent.com",
    authEndpoint: "https://script.google.com/macros/s/AKfycbzdtxNDDOwGyZ44oMbx4LPktnQvdKemF0c2kdbpD63rmzAsF-tiUDOtheBAgej1SWaH/exec",
    trustedDeviceDays: 36500,
  };

  const TOP_LEVEL_LOGIN_PARAM = "topLogin";
  const listeners = new Set();
  let authState = null;
  let activeContext = null;
  let activePromise = null;
  let googleScriptPromise = null;
  let googleInitialized = false;
  let googleButtonRendered = false;
  let pendingResolve = null;
  let pendingReject = null;
  const AUTH_REQUEST_TIMEOUT_MS = 20000;

  function getConfig() {
    const external = window.SAHMT_SYNC_CONFIG?.auth || {};
    return { ...DEFAULT_CONFIG, ...external };
  }

  function ensureStyles() {
    if (document.getElementById("sahmt-auth-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "sahmt-auth-style";
    style.textContent = `
      body.sahmt-auth-locked {
        overflow: hidden !important;
      }
      .sahmt-auth-gate {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 20px;
        background:
          radial-gradient(circle at 16% 8%, rgba(90, 159, 255, 0.22), transparent 30%),
          linear-gradient(160deg, rgba(10, 35, 66, 0.94), rgba(14, 24, 38, 0.92));
      }
      .sahmt-auth-gate[hidden] {
        display: none !important;
      }
      .sahmt-auth-card {
        width: min(430px, 100%);
        display: grid;
        gap: 14px;
        padding: 24px 20px;
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
        text-align: center;
      }
      .sahmt-auth-kicker {
        margin: 0;
        color: #2563eb;
        font-size: 0.74rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .sahmt-auth-title {
        margin: 0;
        color: #10233d;
        font-size: clamp(1.7rem, 6vw, 2.35rem);
        line-height: 1.05;
      }
      .sahmt-auth-text {
        margin: 0;
        color: #4b5563;
        font-size: 0.96rem;
        font-weight: 700;
        line-height: 1.45;
      }
      .sahmt-auth-actions {
        display: grid;
        gap: 10px;
        justify-items: center;
      }
      .sahmt-google-signin {
        width: 100%;
        min-height: 52px;
        display: grid;
        justify-items: center;
      }
      .sahmt-google-signin[hidden] {
        display: none !important;
      }
      .sahmt-google-signin > div {
        width: 100% !important;
        display: flex;
        justify-content: center;
      }
      .sahmt-auth-button,
      .sahmt-auth-link {
        width: 100%;
        min-height: 48px;
        padding: 12px 16px;
        border-radius: 999px;
        border: 0;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: #f8fbff;
        font-size: 0.9rem;
        font-weight: 900;
        letter-spacing: 0.04em;
        text-decoration: none;
        cursor: pointer;
      }
      .sahmt-auth-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }
      .sahmt-auth-secondary {
        width: 100%;
        border: 0;
        background: transparent;
        color: #1d4ed8;
        font-size: 0.84rem;
        font-weight: 900;
        text-decoration: underline;
        cursor: pointer;
      }
      .sahmt-user-pill {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 10px);
        right: 10px;
        z-index: 9500;
        max-width: min(78vw, 360px);
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(11, 35, 63, 0.9);
        color: #f8fbff;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.24);
        backdrop-filter: blur(10px);
      }
      .sahmt-user-pill[hidden] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureGate() {
    let gate = document.getElementById("sahmt-auth-gate");
    if (gate) {
      return gate;
    }

    gate = document.createElement("section");
    gate.id = "sahmt-auth-gate";
    gate.className = "sahmt-auth-gate";
    gate.hidden = true;
    gate.innerHTML = `
      <div class="sahmt-auth-card">
        <p class="sahmt-auth-kicker">Acesso protegido</p>
        <h1 class="sahmt-auth-title">SAHMT</h1>
        <p id="sahmt-auth-message" class="sahmt-auth-text">Carregando autenticação Google...</p>
        <div class="sahmt-auth-actions">
          <div id="sahmt-google-signin" class="sahmt-google-signin" hidden></div>
          <button id="sahmt-auth-open" class="sahmt-auth-button" type="button" hidden>Abrir tela de login</button>
          <button id="sahmt-auth-other-account" class="sahmt-auth-secondary" type="button" hidden>Escolher outra conta Google</button>
        </div>
      </div>
    `;
    document.body.appendChild(gate);

    gate.querySelector("#sahmt-auth-open")?.addEventListener("click", () => {
      if (activeContext) {
        openTopLevelLogin(activeContext);
      }
    });
    gate.querySelector("#sahmt-auth-other-account")?.addEventListener("click", () => {
      chooseAnotherGoogleAccount().catch((error) => {
        showGateMessage(error?.message || "Não foi possível abrir a escolha de conta.", { showGoogle: true, showOther: true });
      });
    });

    return gate;
  }

  function ensureUserPill() {
    let pill = document.getElementById("sahmt-user-pill");
    if (pill) {
      return pill;
    }
    pill = document.createElement("div");
    pill.id = "sahmt-user-pill";
    pill.className = "sahmt-user-pill";
    pill.hidden = true;
    document.body.appendChild(pill);
    return pill;
  }

  function showGateMessage(message, options = {}) {
    ensureStyles();
    const gate = ensureGate();
    const messageEl = gate.querySelector("#sahmt-auth-message");
    const googleEl = gate.querySelector("#sahmt-google-signin");
    const openEl = gate.querySelector("#sahmt-auth-open");
    const otherEl = gate.querySelector("#sahmt-auth-other-account");

    if (messageEl) {
      messageEl.textContent = message;
    }
    if (googleEl) {
      googleEl.hidden = !options.showGoogle;
    }
    if (openEl) {
      openEl.hidden = !options.showOpen;
      openEl.textContent = options.openLabel || "Abrir tela de login";
    }
    if (otherEl) {
      otherEl.hidden = !options.showOther;
    }

    document.body.classList.add("sahmt-auth-locked");
    gate.hidden = false;
  }

  function hideGate() {
    const gate = ensureGate();
    gate.hidden = true;
    document.body.classList.remove("sahmt-auth-locked");
  }

  function updateUserUi() {
    const pill = ensureUserPill();
    const label = authState?.email ? `Acesso: ${authState.email}` : "";
    pill.textContent = label;
    pill.hidden = !label;

    document.querySelectorAll("#auth-user, [data-auth-user]").forEach((element) => {
      element.textContent = label || "Acesso liberado";
    });
  }

  function notifyListeners() {
    updateUserUi();
    listeners.forEach((listener) => {
      try {
        listener(authState);
      } catch {
        // Ignore listener errors.
      }
    });
  }

  function isEmbeddedContext() {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  }

  function isLikelyIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(ua) && "ontouchend" in document);
  }

  function shouldRequireTopLevelLogin() {
    return isEmbeddedContext() && isLikelyIOS();
  }

  function openTopLevelLogin(context) {
    const url = new URL(window.location.href);
    url.searchParams.set(TOP_LEVEL_LOGIN_PARAM, "1");
    if (context?.returnUrl) {
      url.searchParams.set("returnTo", context.returnUrl);
    }
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url.toString();
        return;
      }
    } catch {
      // Fallback below.
    }
    window.location.href = url.toString();
  }

  function getJwtExpirationMs(token) {
    try {
      const [, payload] = String(token || "").split(".");
      const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      return Number(json.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  function getOrCreateDeviceToken(config) {
    try {
      const saved = JSON.parse(localStorage.getItem(config.trustedDeviceKey) || "null");
      if (saved?.deviceToken && /^[a-f0-9]{64}$/i.test(saved.deviceToken)) {
        return saved.deviceToken.toLowerCase();
      }
    } catch {
      // Recreate below.
    }

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const deviceToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(config.trustedDeviceKey, JSON.stringify({ deviceToken, createdAt: new Date().toISOString() }));
    return deviceToken;
  }

  function getTrustedDeviceFallbackExpiry() {
    return "9999-12-31T23:59:59.000Z";
  }

  function persistSession(config) {
    if (!authState?.deviceToken || !authState?.email || !authState?.trustedDeviceExpiresAt) {
      return;
    }
    const serialized = JSON.stringify(authState);
    localStorage.setItem(config.authSessionKey, serialized);
    sessionStorage.setItem(config.authSessionBackupKey, serialized);
  }

  function clearSession(config) {
    localStorage.removeItem(config.authSessionKey);
    sessionStorage.removeItem(config.authSessionBackupKey);
  }

  function readStoredSession(config) {
    try {
      const raw = localStorage.getItem(config.authSessionKey) || sessionStorage.getItem(config.authSessionBackupKey) || "null";
      const saved = JSON.parse(raw);
      if (!saved?.deviceToken || !saved?.email || !saved?.trustedDeviceExpiresAt) {
        return null;
      }
      if (Date.parse(saved.trustedDeviceExpiresAt) <= Date.now() + 120000) {
        clearSession(config);
        return null;
      }
      return saved;
    } catch {
      clearSession(config);
      return null;
    }
  }

  function applyAuthenticatedUser(nextState) {
    authState = {
      token: nextState.token || "",
      email: String(nextState.email || "").toLowerCase(),
      name: nextState.name || "",
      deviceToken: nextState.deviceToken || "",
      trustedDeviceExpiresAt: nextState.trustedDeviceExpiresAt || getTrustedDeviceFallbackExpiry(),
      expiresAt: Number(nextState.expiresAt || 0),
    };
    notifyListeners();
  }

  function parseAuthResponseText(responseText) {
    const trimmed = String(responseText || "").trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      if (/<html[\s>]/i.test(trimmed) || /<!doctype/i.test(trimmed)) {
        throw new Error("A implantação de autenticação não respondeu como web app válido.");
      }
      throw new Error("A implantação de autenticação devolveu um formato inválido.");
    }
  }

  async function postAuthAction(action, payload) {
    const config = getConfig();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)
      : 0;

    let response;
    try {
      response = await fetch(config.authEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        cache: "no-store",
        signal: controller?.signal,
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("A autenticação demorou demais para responder. Tente novamente em alguns segundos.");
      }
      throw new Error("Não foi possível conectar a implantação de autenticação.");
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }

    const responseText = await response.text().catch(() => "");
    const result = parseAuthResponseText(responseText);
    if (!response.ok || result.ok !== true) {
      throw new Error(result.message || "Falha de autenticação.");
    }
    return result;
  }

  async function validateGoogleCredential(idToken, context) {
    const config = getConfig();
    const deviceToken = getOrCreateDeviceToken(config);
    return postAuthAction("auth", {
      authToken: idToken,
      deviceToken,
      moduleId: context.moduleId,
      pageId: context.pageId,
      path: window.location.pathname,
      embedded: isEmbeddedContext(),
      userAgent: navigator.userAgent || "",
    });
  }

  async function validateTrustedDevice(savedAuth, context) {
    return postAuthAction("auth", {
      deviceToken: savedAuth.deviceToken,
      userEmail: savedAuth.email,
      moduleId: context.moduleId,
      pageId: context.pageId,
      path: window.location.pathname,
      embedded: isEmbeddedContext(),
      userAgent: navigator.userAgent || "",
    });
  }

  async function trackAccess(eventType, detail) {
    if (!authState?.email) {
      return;
    }
    try {
      await postAuthAction("track", {
        eventType: eventType || "page_access",
        moduleId: activeContext?.moduleId || "",
        pageId: activeContext?.pageId || "",
        pageTitle: document.title || "",
        path: window.location.pathname,
        embedded: isEmbeddedContext(),
        deviceToken: authState.deviceToken || "",
        userEmail: authState.email || "",
        userName: authState.name || "",
        detail: detail || "",
        userAgent: navigator.userAgent || "",
      });
    } catch {
      // Audit failures must not block the app.
    }
  }

  function loadGoogleScript() {
    if (googleScriptPromise) {
      return googleScriptPromise;
    }

    googleScriptPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("O login Google não carregou neste navegador."));
      document.head.appendChild(script);
    });

    return googleScriptPromise;
  }

  function initializeGoogleIdentity() {
    if (googleInitialized) {
      return;
    }

    const config = getConfig();
    window.google.accounts.id.initialize({
      client_id: config.googleClientId,
      auto_select: false,
      cancel_on_tap_outside: false,
      itp_support: true,
      use_fedcm_for_button: false,
      button_auto_select: false,
      callback(response) {
        handleGoogleCredentialResponse(response?.credential || "").catch((error) => {
          if (pendingReject) {
            pendingReject(error);
            pendingReject = null;
          }
        });
      },
    });
    googleInitialized = true;
  }

  function renderGoogleButton() {
    const target = ensureGate().querySelector("#sahmt-google-signin");
    if (!target || !window.google?.accounts?.id) {
      return;
    }
    if (googleButtonRendered) {
      target.hidden = false;
      return;
    }
    target.innerHTML = "";
    target.hidden = false;
    window.google.accounts.id.renderButton(target, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 280,
    });
    googleButtonRendered = true;
  }

  async function chooseAnotherGoogleAccount() {
    await loadGoogleScript();
    initializeGoogleIdentity();
    renderGoogleButton();
    window.google.accounts.id.disableAutoSelect?.();
    window.google.accounts.id.cancel?.();
    window.google.accounts.id.prompt((notification) => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        showGateMessage(
          "O seletor automático foi bloqueado. Toque no botão Google acima ou escolha outra conta já conectada ao navegador.",
          { showGoogle: true, showOther: true }
        );
      }
    });
  }

  async function handleGoogleCredentialResponse(credential) {
    if (!credential) {
      throw new Error("Conta Google não autorizada.");
    }
    try {
      showGateMessage("Validando conta Google cadastrada...", { showGoogle: false, showOther: false });
      const config = getConfig();
      const result = await validateGoogleCredential(credential, activeContext || {});
      applyAuthenticatedUser({
        token: credential,
        email: String(result.email || "").toLowerCase(),
        name: result.name || "",
        deviceToken: getOrCreateDeviceToken(config),
        trustedDeviceExpiresAt: result.trustedDeviceExpiresAt || getTrustedDeviceFallbackExpiry(),
        expiresAt: getJwtExpirationMs(credential),
      });
      persistSession(config);
      hideGate();
      await trackAccess("login_success", "Conta Google autorizada");
      if (pendingResolve) {
        pendingResolve(authState);
        pendingResolve = null;
        pendingReject = null;
      }
    } catch (error) {
      showGateMessage(error?.message || "Não foi possível concluir o login Google.", { showGoogle: true, showOther: true });
      if (pendingReject) {
        pendingReject(error);
        pendingReject = null;
        pendingResolve = null;
      }
      throw error;
    }
  }

  async function restoreTrustedDeviceSession(context) {
    const config = getConfig();
    const saved = readStoredSession(config);
    if (!saved) {
      return null;
    }
    const result = await validateTrustedDevice(saved, context);
    applyAuthenticatedUser({
      token: "",
      email: String(result.email || saved.email || "").toLowerCase(),
      name: result.name || saved.name || "",
      deviceToken: saved.deviceToken,
      trustedDeviceExpiresAt: result.trustedDeviceExpiresAt || saved.trustedDeviceExpiresAt || getTrustedDeviceFallbackExpiry(),
      expiresAt: 0,
    });
    persistSession(config);
    return authState;
  }

  async function requireAccess(context = {}) {
    if (activePromise) {
      return activePromise;
    }

    ensureStyles();
    ensureGate();
    ensureUserPill();
    activeContext = {
      moduleId: context.moduleId || "SAHMT",
      pageId: context.pageId || "home",
      returnUrl: context.returnUrl || "",
    };

    activePromise = (async () => {
      const config = getConfig();
      try {
        const restored = await restoreTrustedDeviceSession(activeContext);
        if (restored) {
          hideGate();
          await trackAccess("page_access", "Dispositivo confiável");
          return restored;
        }
      } catch {
        clearSession(config);
      }

      authState = null;
      notifyListeners();

      if (shouldRequireTopLevelLogin()) {
        showGateMessage(
          "No iPhone, faça o primeiro login Google desta área em tela própria. Depois o dispositivo ficará liberado.",
          { showOpen: true, openLabel: "Abrir login desta área" }
        );
        return new Promise(() => {});
      }

      await loadGoogleScript();
      initializeGoogleIdentity();
      renderGoogleButton();
      showGateMessage("Escolha sua conta Google cadastrada para entrar.", { showGoogle: true, showOther: true });
      return await new Promise((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    })().finally(() => {
      activePromise = null;
    });

    return activePromise;
  }

  function withPayload(payload = {}) {
    return {
      ...payload,
      authToken: authState?.token || "",
      deviceToken: authState?.deviceToken || "",
      userEmail: authState?.email || "",
      userName: authState?.name || "",
    };
  }

  function addAuthToUrl(url) {
    if (!(url instanceof URL)) {
      return url;
    }
    if (authState?.token) {
      url.searchParams.set("authToken", authState.token);
    }
    if (authState?.deviceToken) {
      url.searchParams.set("deviceToken", authState.deviceToken);
    }
    if (authState?.email) {
      url.searchParams.set("userEmail", authState.email);
    }
    return url;
  }

  window.SAHMT_AUTH = {
    requireAccess,
    getSession() {
      return authState;
    },
    getUserLabel() {
      return authState?.email || "";
    },
    withPayload,
    addAuthToUrl,
    track: trackAccess,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
