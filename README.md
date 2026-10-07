# Luau Coder

Luau Coder is a Windows desktop assistant for Roblox Studio. The repository contains a static website, an Electron desktop app, and a Studio plugin source file.

## Run the desktop app

1. Install Node.js 20 or newer.
2. From this folder, run `npm install`.
3. Run `npm start`.
4. In the app, open **Paramètres IA**, create an OpenRouter API key at <https://openrouter.ai/keys>, and save it. The key is encrypted with Windows secure storage.
5. Open **Plugin Studio** in the app and copy the pairing code.
6. Install `plugin/LuauCoderPlugin.lua` as a local Roblox Studio plugin, paste the pairing code in its dock widget, and select a Script, LocalScript, or ModuleScript.

The app uses OpenRouter's `openrouter/free` router. OpenRouter chooses from free models available at request time; availability, rate limits, and selected model can change. The OpenRouter key is only used by the desktop app and is never sent to the Studio plugin.

The local bridge binds only to `127.0.0.1:37842` and requires a random pairing code generated at each app launch. The plugin sends the selected script's source to the local app. Forwarding that source to OpenRouter is opt-in and disabled by default in the app settings. A code suggestion is not written to Studio unless you explicitly confirm the replacement in the plugin. Review generated code before using it.

## Build the Windows installer

Run `npm run dist`. The NSIS installer is written to `release/Luau-Coder-Setup-0.1.0.exe`. The download page is intentionally marked unpublished until you host and publish that installer.

## Website

Open `index.html` directly or serve this folder with any static web server. The site pages are `index.html`, `features.html`, `plugin.html`, and `download.html`.
