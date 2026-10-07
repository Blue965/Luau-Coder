# Luau Coder

Luau Coder is a Windows desktop assistant for Roblox Studio. The repository contains a static website, an Electron desktop app, and a Studio plugin source file.

## Run the desktop app

1. Install Node.js 20 or newer.
2. From this folder, run `npm install`.
3. Run `npm start`.
4. In the app, open **Paramètres IA**, choose a provider, enter its API key and model, and save. The key is encrypted with Windows secure storage.
5. Open **Plugin Studio** in the app and copy the pairing code.
6. Install `plugin/LuauCoderPlugin.lua` as a local Roblox Studio plugin, paste the pairing code in its dock widget, and select a Script, LocalScript, or ModuleScript.

Choose OpenRouter, OpenAI, Anthropic Claude, or a custom OpenAI-compatible endpoint and model in **Paramètres IA**. API keys are encrypted with Windows secure storage; provider settings are kept in the app's local user-data directory, not in a `.env` file. The OpenRouter preset uses `openrouter/free`; free-model availability and rate limits are controlled by OpenRouter. Anthropic uses its native Messages API. Custom providers must implement the OpenAI-compatible chat completions API. Users pay for API usage according to their provider and model.

The local bridge binds only to `127.0.0.1:37842` and requires a random pairing code generated at each app launch. The plugin sends the selected script's source to the local app. Forwarding that source to the selected AI provider is opt-in and disabled by default in the app settings. A code suggestion is not written to Studio unless you explicitly confirm the replacement in the plugin. Review generated code before using it.

## Build the Windows installer

Run `npm run dist`. The NSIS installer is written to `dist/Luau-Coder-Setup-0.1.0.exe`. The published executable is attached to the `v0.1.0` GitHub Release as `Luau-Coder.exe`.

## Website

Open `index.html` directly or serve this folder with any static web server. The site pages are `index.html`, `features.html`, `plugin.html`, and `download.html`; Vercel's `cleanUrls` configuration exposes them at `/`, `/features`, `/plugin`, and `/download`.
