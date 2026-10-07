const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  PROVIDERS,
  extractAssistantText,
  getProviderConfig,
  getRequestForProvider,
  validateProviderConfig,
} = require("./provider-api");

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 37842;
const MAX_SOURCE_LENGTH = 40_000;
const MAX_APPLY_LENGTH = 40_000;
const SETTINGS_FILE = "settings.json";
const API_KEYS_FILE = "provider-keys.bin";
const LEGACY_API_KEY_FILE = "openrouter-key.bin";
let mainWindow;
let bridgeServer;
let lastPluginContext = null;
let lastPluginSeenAt = 0;
let pendingApply = null;
let includeStudioContext = false;
let settings = {
  provider: "openrouter",
  providers: {},
};
let apiKeys = {};
const pairingToken = crypto.randomBytes(24).toString("hex");

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function getApiKeysPath() {
  return path.join(app.getPath("userData"), API_KEYS_FILE);
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    const stored = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (stored && typeof stored === "object") {
      settings = {
        provider: PROVIDERS[stored.provider] ? stored.provider : "openrouter",
        providers: stored.providers && typeof stored.providers === "object" ? stored.providers : {},
      };
      includeStudioContext = stored.includeStudioContext === true;
    }
  }

  const keysPath = getApiKeysPath();
  if (fs.existsSync(keysPath)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Le stockage sécurisé de Windows n’est pas disponible. Les clés API n’ont pas été déchiffrées.");
    }
    apiKeys = JSON.parse(safeStorage.decryptString(fs.readFileSync(keysPath)));
  } else {
    const legacyPath = path.join(app.getPath("userData"), LEGACY_API_KEY_FILE);
    if (fs.existsSync(legacyPath)) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Le stockage sécurisé de Windows n’est pas disponible pour migrer l’ancienne clé OpenRouter.");
      }
      apiKeys.openrouter = safeStorage.decryptString(fs.readFileSync(legacyPath));
      saveApiKeys();
    }
  }
}

function saveSettings() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

function saveApiKeys() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Le stockage sécurisé de Windows n’est pas disponible. La clé n’a pas été enregistrée.");
  }
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(getApiKeysPath(), safeStorage.encryptString(JSON.stringify(apiKeys)), { mode: 0o600 });
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function readJson(request, maxBytes = 128_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("La requête dépasse la taille maximale autorisée."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Le corps de la requête JSON est invalide."));
      }
    });
    request.on("error", reject);
  });
}

function isAuthorized(request) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(pairingToken);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function publicPluginState() {
  const isConnected = Date.now() - lastPluginSeenAt < 8_000;
  return {
    connected: isConnected,
    context: isConnected ? lastPluginContext : null,
    pairingToken,
    bridgeUrl: `http://${BRIDGE_HOST}:${BRIDGE_PORT}`,
    pendingApply: Boolean(pendingApply),
  };
}

function notifyRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("plugin:update", publicPluginState());
  }
}

function validatePluginContext(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Le contexte du plugin est invalide.");
  }

  if (body.script === null || body.script === undefined) return null;
  if (!body.script || typeof body.script !== "object") {
    throw new Error("Les informations du script sélectionné sont invalides.");
  }

  const { name, className, path: scriptPath, source } = body.script;
  if (
    typeof name !== "string" ||
    typeof className !== "string" ||
    typeof scriptPath !== "string" ||
    typeof source !== "string"
  ) {
    throw new Error("Le contexte du script sélectionné est incomplet.");
  }
  if (!["Script", "LocalScript", "ModuleScript"].includes(className)) {
    throw new Error("Le type du script sélectionné n’est pas pris en charge.");
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error("Le script sélectionné dépasse la limite de 40 000 caractères.");
  }

  return {
    name: name.slice(0, 200),
    className,
    path: scriptPath.slice(0, 500),
    source,
  };
}

async function handlePluginPoll(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Code d’association invalide." });
    return;
  }

  const body = await readJson(request);
  const nextContext = validatePluginContext(body);
  if (typeof body.acknowledgedId === "string" && pendingApply?.id === body.acknowledgedId) {
    pendingApply = null;
  }

  lastPluginContext = nextContext;
  lastPluginSeenAt = Date.now();
  notifyRenderer();

  sendJson(response, 200, {
    connected: true,
    operation: pendingApply,
  });
}

function startBridgeServer() {
  bridgeServer = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, { status: "ok", product: "Luau Coder" });
      return;
    }

    if (request.method === "POST" && request.url === "/api/plugin/poll") {
      handlePluginPoll(request, response).catch((error) => {
        if (!response.headersSent && !response.destroyed) {
          sendJson(response, 400, { error: error.message });
        }
      });
      return;
    }

    sendJson(response, 404, { error: "Route introuvable." });
  });

  bridgeServer.on("error", (error) => {
    console.error("Le pont local Luau Coder n’a pas pu démarrer :", error);
    notifyRenderer();
  });

  bridgeServer.listen(BRIDGE_PORT, BRIDGE_HOST);
}

function getContextForPrompt() {
  if (Date.now() - lastPluginSeenAt >= 8_000 || !lastPluginContext) return null;
  return lastPluginContext;
}

function getUserContent(prompt, context) {
  if (!context) return prompt.trim();
  return `Script sélectionné dans Roblox Studio : ${context.path} (${context.className})\n\n\`\`\`lua\n${context.source}\n\`\`\`\n\nDemande :\n${prompt.trim()}`;
}

async function requestAssistantReply(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Écris une demande avant de l’envoyer.");
  }
  if (prompt.length > 10_000) {
    throw new Error("Ta demande dépasse la limite de 10 000 caractères.");
  }

  const providerId = settings.provider;
  const provider = PROVIDERS[providerId];
  const savedConfig = getProviderConfig(providerId, settings.providers);
  const config = validateProviderConfig(providerId, savedConfig.model, savedConfig.baseUrl);
  const apiKey = apiKeys[providerId];
  if (!apiKey) {
    throw new Error(`Ajoute ta clé API ${provider.label} dans les paramètres.`);
  }

  const context = includeStudioContext ? getContextForPrompt() : null;
  const request = getRequestForProvider(providerId, config, apiKey, getUserContent(prompt, context));
  const result = await fetch(request.endpoint, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(90_000),
  });

  const responseText = await result.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`${provider.label} a renvoyé une réponse illisible (HTTP ${result.status}).`);
  }
  if (!result.ok) {
    const detail = payload?.error?.message;
    throw new Error(
      typeof detail === "string"
        ? `${provider.label} : ${detail}`
        : `La requête ${provider.label} a échoué (HTTP ${result.status}).`,
    );
  }

  const content = extractAssistantText(provider, payload);
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error(`${provider.label} n’a renvoyé aucun texte de réponse.`);
  }
  return { content, model: payload.model || config.model, provider: provider.label };
}

function queueCodeForStudio(code) {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new Error("Le bloc de code à envoyer est vide.");
  }
  if (code.length > MAX_APPLY_LENGTH) {
    throw new Error("Le bloc de code dépasse la limite de 40 000 caractères.");
  }
  const context = getContextForPrompt();
  if (!context) throw new Error("Roblox Studio n’est pas connecté avec un script sélectionné.");
  if (pendingApply) throw new Error("Une demande d’application est déjà en attente dans Studio.");

  const operation = {
    id: crypto.randomUUID(),
    targetPath: context.path,
    targetName: context.name,
    targetClass: context.className,
    code,
  };
  pendingApply = operation;
  notifyRenderer();
  return { queued: true, targetName: operation.targetName };
}

ipcMain.handle("settings:get", () => ({
  provider: settings.provider,
  providers: Object.fromEntries(
    Object.keys(PROVIDERS).map((providerId) => [
      providerId,
      {
        ...getProviderConfig(providerId, settings.providers),
        label: PROVIDERS[providerId].label,
        protocol: PROVIDERS[providerId].protocol,
        hasApiKey: Boolean(apiKeys[providerId]),
        helpUrl: PROVIDERS[providerId].helpUrl,
      },
    ]),
  ),
  includeStudioContext,
}));
ipcMain.handle("settings:saveProvider", (_event, input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("La configuration du fournisseur IA est invalide.");
  }
  const providerId = input.provider;
  const config = validateProviderConfig(providerId, input.model, input.baseUrl);
  const key = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (key && (key.length < 12 || key.length > 2_000)) {
    throw new Error("La clé API doit contenir entre 12 et 2 000 caractères.");
  }
  if (!key && !apiKeys[providerId]) {
    throw new Error(`Saisis une clé API ${PROVIDERS[providerId].label} pour enregistrer ce fournisseur.`);
  }
  if (key) {
    apiKeys[providerId] = key;
    saveApiKeys();
  }
  settings.providers[providerId] = config;
  settings.provider = providerId;
  saveSettings();
  return {
    provider: providerId,
    hasApiKey: Boolean(apiKeys[providerId]),
  };
});
ipcMain.handle("settings:setStudioContext", (_event, enabled) => {
  if (typeof enabled !== "boolean") {
    throw new Error("Le réglage de partage du contexte est invalide.");
  }
  includeStudioContext = enabled;
  settings.includeStudioContext = enabled;
  saveSettings();
  return { includeStudioContext };
});
ipcMain.handle("assistant:send", (_event, prompt) => requestAssistantReply(prompt));
ipcMain.handle("studio:getState", () => publicPluginState());
ipcMain.handle("studio:applyCode", (_event, code) => queueCodeForStudio(code));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#0b0c10",
    title: "Luau Coder",
    icon: path.join(__dirname, "renderer", "logo.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady()
  .then(() => {
    try {
      loadSettings();
    } catch (error) {
      console.error("Les paramètres de Luau Coder n’ont pas pu être chargés :", error);
      app.quit();
      return;
    }
    startBridgeServer();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error) => {
    console.error("Luau Coder n’a pas pu démarrer :", error);
    app.quit();
  });

app.on("before-quit", () => {
  if (bridgeServer) bridgeServer.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
