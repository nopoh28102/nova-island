# Nova Productivity Hub — Edition 2 (Community Extension)

This branch adds six integrated features to the Music Island Local fork of Nova Island 1.6.0.

## Features
1. **Command Center:** open with Ctrl+Shift+Space or the ✦ button beside Settings. Search installed apps, index a user-chosen folder (maximum 1600 files, four subfolder levels), perform arithmetic expressions beginning with =. Only approved actions can execute; it is not a shell.
2. **Magic Drop:** choose files or drag files into the Hub. Create ZIP archives through Windows tar.exe; copy files to a chosen destination (never overwrite); copy paths or reveal items in Explorer. ZIP currently needs all chosen files to reside in one directory.
3. **Smart Modes:** Normal / Work / Focus / Gaming presets temporarily adjust Nova's reminder, notification and performance preferences. Original values are restored when switching to Normal or exiting the app.
4. **Live Activities:** recent file operations, download statuses from Nova's existing IDM bridge, automation events, pairing and inbound phone transfers. Local history is in memory, not uploaded.
5. **Phone Connect:** manually start a local HTTP listener bound to a private IPv4 address. A rotating 8-digit pairing code and 30-minute HttpOnly cookie enable phone-to-PC file uploads (20 MiB max per file) and explicit phone-to-PC clipboard notes. The desktop user can explicitly share a selected PC file (100 MiB max, 10-minute sharing window) or clipboard text for the paired phone to retrieve. Files land in the user's Downloads/Music Island Phone folder. The listener is stopped on app exit.
6. **Automations Engine:** opt-in allowlisted rules match the foreground app process name or a local HH:MM time. Actions change one of the four preset modes. No arbitrary shell commands or remote automation.

## Security / limitations
- **Do not activate Phone Connect on public/untrusted Wi-Fi. The local HTTP transport is not encrypted.** Pairing resists casual unsolicited access but cannot protect traffic on an adversarial LAN.
- No remote desktop, phone notifications, screen streaming, or incoming system-control commands have been implemented.
- Command file search only searches a directory the user selects, never the whole disk by default.
- Magic Drop writes only to paths explicitly chosen by the desktop user; originals are not deleted.
- New features are part of the fork's source code, not an unofficial .nvp plugin. Original signature verification remains unchanged.
- Product and data folder are kept separate from official Nova Island by the existing build-preparation script.
- UI and Phone Connect still need manual validation on a real Windows PC/phone after CI.

## Build and tests
The updated GitHub workflow runs the existing local-music integration, prepares the separate fork product, integrates hub/apply.cjs, checks JavaScript syntax, runs Node tests for logic and the phone server, and builds x64 Setup and Portable EXE artifacts.

Local source preview on Windows (after running local-music integration and prepare-build first):

    node hub/apply.cjs .
    node --test hub/logic.test.cjs hub/phone.test.cjs
    npm ci && npm start

## Attribution
Based on NOVA-TECH-KIT/nova-island (GPL-3.0-only). Unofficial community extension; not endorsed by upstream.
