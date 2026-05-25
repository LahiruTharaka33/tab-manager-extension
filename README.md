# TabVault — Workspace-Based Tab Manager

A Chrome Extension (Manifest V3) that turns browser tabs into named **workspaces**. Only one workspace is active at a time — all others are "sleeping" with their tab sessions fully preserved.

## Features

- **Create workspaces** — name them, assign colors
- **Switch workspaces** — snapshot current tabs → close → restore target workspace
- **No tab loss** — URLs, titles, favicons, tab order, pinned/muted states, and scroll positions are saved
- **Side panel** — full workspace manager with tab previews
- **Cloud sync** (optional) — back up workspaces to Firebase

## Project Structure

```
tab-manager-extension/
├── manifest.json
├── background/service-worker.js
├── popup/          # Compact workspace switcher (toolbar)
├── sidepanel/      # Full workspace manager
├── options/        # Settings (cloud sync, theme)
├── core/           # Business logic (workspace controller, tab manager, etc.)
├── storage/        # chrome.storage wrappers
├── cloud/          # Firebase adapter & auth
├── content-scripts/# Captures scroll position before tab close
├── assets/icons/
└── utils/          # Constants, helpers, logger
```

## Installation (Development)

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select this directory
5. The TabVault icon appears in the toolbar

## Tech Stack

- Manifest V3, service workers
- Vanilla JS (no frameworks)
- Chrome APIs: `tabs`, `tabGroups`, `storage`, `scripting`, `sidePanel`, `identity`
