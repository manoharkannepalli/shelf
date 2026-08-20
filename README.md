# Shelf

> A quieter way to read.

Shelf is an open-source, local-first reading space for web links and PDFs. Save something worth returning to, keep it organized, and read it without a noisy dashboard or an account.

## First release direction

- Continue Reading home view
- Offline article snapshots and local PDF storage
- Built-in reading view with an option to open externally
- Browser extension for one-click saving
- Statuses: To Read, Reading, Finished
- Collections and tags
- Local-only data with export and automatic backups
- Self-contained Mac and Windows installers

## Current prototype

The first interface slice is dependency-free HTML, CSS, and JavaScript. It can be opened directly in a browser and includes:

- A calm shelf dashboard with sample content
- Link/PDF add flow
- Local metadata persistence through browser storage
- Light/dark theme toggle
- Continue, all items, saved, collections, search, and grid/list views

The desktop shell includes the offline capture engine and PDF persistence foundation; the browser extension foundation and release workflow are also scaffolded for the first packaged release.

## Run the interface locally

```sh
pnpm install
pnpm run dev
```

The browser extension lives in `extension/`. Load it as an unpacked extension in a Chromium-based browser while developing. The desktop shell uses Tauri 2 and is configured to publish DMG and NSIS installers from GitHub Actions when a version tag is pushed.

## Security notes

- Shelf is local-first: reading data and saved PDFs stay on the device.
- Desktop file access is limited to Shelf's application data folder; the embedded WebView storage folder is excluded.
- Network capture and saved article links accept HTTPS only.
- Imported backups are normalized and have embedded HTML stripped down to safe text paragraphs before display.
- The desktop shell uses a restrictive content security policy and does not expose Tauri APIs globally to the page.
- macOS builds use an ad-hoc signature by default. For trusted downloads without the Gatekeeper workaround, add Apple Developer signing and notarization secrets to the repository; the release workflow already accepts them.

## License

This project is intended to be released under the MIT License.
