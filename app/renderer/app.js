const conversation = document.querySelector("#conversation");
const welcome = document.querySelector("#welcome");
const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt-input");
const sendButton = document.querySelector("#send-button");
const settingsModal = document.querySelector("#settings-modal");
const pairingModal = document.querySelector("#pairing-modal");
const keyFeedback = document.querySelector("#key-feedback");
const pairingFeedback = document.querySelector("#pairing-feedback");
const contextConsent = document.querySelector("#include-context");
const providerForm = document.querySelector("#provider-form");
const providerSelect = document.querySelector("#provider-select");
const modelInput = document.querySelector("#model-name");
const baseUrlInput = document.querySelector("#base-url");
const apiKeyInput = document.querySelector("#api-key");
const providerHelp = document.querySelector("#provider-help");
let providerSettings = {};
let includeStudioContext = false;
let studioState = null;

function showModal(modal) {
  modal.hidden = false;
  modal.querySelector("input, button")?.focus();
}

function closeModal(modal) {
  modal.hidden = true;
}

document.querySelector("#open-settings").addEventListener("click", () => showModal(settingsModal));
document.querySelector("#show-pairing").addEventListener("click", () => showModal(pairingModal));
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
});
document.querySelectorAll(".modal-backdrop").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
});

async function refreshSettings() {
  try {
    const settings = await window.luauCoder.getSettings();
    providerSettings = settings.providers;
    providerSelect.value = settings.provider;
    includeStudioContext = settings.includeStudioContext;
    contextConsent.checked = includeStudioContext;
    showProviderSettings(settings.provider);
    if (studioState) renderStudioState(studioState);
  } catch (error) {
    keyFeedback.textContent = error.message;
    showModal(settingsModal);
  }
}

function showProviderSettings(providerId) {
  const config = providerSettings[providerId];
  if (!config) return;
  modelInput.value = config.model;
  baseUrlInput.value = config.baseUrl;
  document.querySelector("#base-url-field").hidden = config.protocol === "anthropic";
  document.querySelector("#key-saved-state").textContent = config.hasApiKey
    ? "· Clé enregistrée — laisse vide pour la garder"
    : "· Clé requise";
  apiKeyInput.placeholder = config.hasApiKey
    ? "Clé enregistrée — vide pour la garder"
    : "Colle ta clé API";
  if (config.helpUrl) {
    providerHelp.href = config.helpUrl;
    providerHelp.hidden = false;
  } else {
    providerHelp.hidden = true;
  }
  document.querySelector("#key-state").textContent = config.hasApiKey
    ? config.label
    : "Clé requise";
  document.querySelector("#key-state").classList.toggle("is-set", config.hasApiKey);
  document.querySelector("#active-model").textContent = `${config.label} · ${config.model || "modèle non défini"}`;
}

providerSelect.addEventListener("change", () => {
  apiKeyInput.value = "";
  keyFeedback.textContent = "";
  showProviderSettings(providerSelect.value);
});

providerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = providerForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  keyFeedback.textContent = "Enregistrement sécurisé…";
  try {
    await window.luauCoder.saveProviderSettings({
      provider: providerSelect.value,
      model: modelInput.value,
      baseUrl: baseUrlInput.value,
      apiKey: apiKeyInput.value,
    });
    apiKeyInput.value = "";
    keyFeedback.textContent = "Fournisseur et modèle enregistrés. La clé est chiffrée sur cet ordinateur.";
    await refreshSettings();
  } catch (error) {
    keyFeedback.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

contextConsent.addEventListener("change", async () => {
  const requestedValue = contextConsent.checked;
  contextConsent.disabled = true;
  try {
    const result = await window.luauCoder.setStudioContext(requestedValue);
    includeStudioContext = result.includeStudioContext;
    keyFeedback.textContent = includeStudioContext
      ? "Le script sélectionné sera transmis au fournisseur choisi."
      : "Le contenu du script ne sera pas transmis au fournisseur IA.";
    if (studioState) renderStudioState(studioState);
  } catch (error) {
    contextConsent.checked = includeStudioContext;
    keyFeedback.textContent = error.message;
  } finally {
    contextConsent.disabled = false;
  }
});

function renderStudioState(state) {
  studioState = state;
  const connected = state.connected;
  const hasContext = connected && state.context;
  document.querySelector("#connection-indicator").classList.toggle("is-online", Boolean(connected));
  document.querySelector(".topbar-status").classList.toggle("is-online", Boolean(connected));
  document.querySelector("#connection-copy").textContent = hasContext
    ? `Connecté · ${state.context.className}`
    : connected
      ? "Connecté · sélectionne un script"
    : "Plugin non connecté";
  document.querySelector("#topbar-connection").textContent = connected
    ? "Studio connecté"
    : "Studio hors ligne";
  document.querySelector("#context-hint").textContent = hasContext
    ? includeStudioContext
      ? `Contexte envoyé à l’IA : ${state.context.path}`
      : `Script local (partage IA désactivé) : ${state.context.path}`
    : connected
      ? "Plugin connecté · sélectionne un script"
      : "Contexte Studio non connecté";
  document.querySelector("#script-name").textContent = hasContext
    ? state.context.path
    : "Aucun script sélectionné";
  document.querySelector("#pairing-token").textContent = state.pairingToken || "Indisponible";
  if (state.pendingApply) {
    pairingFeedback.textContent = "Une suggestion attend ta confirmation dans Roblox Studio.";
  }
}

window.luauCoder.onStudioUpdate(renderStudioState);
window.luauCoder.getStudioState().then(renderStudioState).catch((error) => {
  pairingFeedback.textContent = error.message;
});

document.querySelector("#copy-token").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#pairing-token").textContent);
    pairingFeedback.textContent = "Code copié. Colle-le dans le plugin Studio.";
  } catch {
    pairingFeedback.textContent = "Copie impossible : sélectionne le code et copie-le manuellement.";
  }
});

function addUserMessage(text) {
  const turn = document.createElement("article");
  turn.className = "chat-turn";
  const bubble = document.createElement("div");
  bubble.className = "user-bubble";
  bubble.textContent = text;
  turn.append(bubble);
  conversation.append(turn);
  return turn;
}

function addAssistantMessage(turn, response) {
  const bubble = document.createElement("div");
  bubble.className = "assistant-bubble";
  const avatar = document.createElement("span");
  avatar.className = "assistant-avatar";
  const avatarLogo = document.createElement("img");
  avatarLogo.src = "logo.svg";
  avatarLogo.alt = "";
  avatar.append(avatarLogo);
  const content = document.createElement("div");
  content.className = "assistant-text";

  const codePattern = /```(?:lua|luau)?[ \t]*\r?\n([\s\S]*?)```/gi;
  let cursor = 0;
  let match;
  while ((match = codePattern.exec(response.content)) !== null) {
    const codeToApply = match[1].replace(/\n$/, "");
    appendPlainText(content, response.content.slice(cursor, match.index));
    const code = document.createElement("pre");
    code.textContent = codeToApply;
    content.append(code);
    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "apply-code";
    applyButton.textContent = "Envoyer ce code au plugin Studio";
    applyButton.addEventListener("click", async () => {
      applyButton.disabled = true;
      try {
        const result = await window.luauCoder.applyCode(codeToApply);
        applyButton.textContent = `Envoyé à Studio · ${result.targetName}`;
      } catch (error) {
        applyButton.disabled = false;
        showToast(turn, error.message);
      }
    });
    content.append(applyButton);
    cursor = codePattern.lastIndex;
  }
  appendPlainText(content, response.content.slice(cursor));

  const model = document.createElement("div");
  model.className = "response-model";
  model.textContent = `MODÈLE · ${response.model}`;
  bubble.append(avatar, content);
  turn.append(bubble, model);
}

function appendPlainText(parent, text) {
  const normalized = text.trim();
  if (!normalized) return;
  const paragraphs = normalized.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const element = document.createElement("p");
    element.textContent = paragraph;
    parent.append(element);
  }
}

function showToast(turn, message) {
  const toast = document.createElement("p");
  toast.className = "toast";
  toast.textContent = message;
  turn.append(toast);
}

async function submitPrompt(prompt) {
  const text = prompt.trim();
  if (!text || sendButton.disabled) return;
  welcome.hidden = true;
  const turn = addUserMessage(text);
  promptInput.value = "";
  sendButton.disabled = true;
  const loading = document.createElement("div");
  loading.className = "assistant-bubble";
  loading.textContent = "Luau Coder prépare une réponse…";
  turn.append(loading);
  conversation.scrollTop = conversation.scrollHeight;

  try {
    const response = await window.luauCoder.sendMessage(text);
    loading.remove();
    addAssistantMessage(turn, response);
  } catch (error) {
    loading.remove();
    showToast(turn, error.message);
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
    conversation.scrollTop = conversation.scrollHeight;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt(promptInput.value);
});
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 140)}px`;
});

document.querySelectorAll(".prompt-suggestions button").forEach((button) => {
  button.addEventListener("click", () => submitPrompt(button.dataset.prompt));
});
document.querySelector("#new-chat").addEventListener("click", () => {
  conversation.replaceChildren(welcome);
  welcome.hidden = false;
  promptInput.focus();
});

refreshSettings();
