# Save to Shelf browser extension

This is a small Manifest V3 extension for Chromium-based browsers. It reads the current tab and sends a `shelf://save` deep link to the installed Shelf desktop app. The desktop app then presents the save flow and handles the offline snapshot locally.

For local testing, load this folder as an unpacked extension from the browser’s extensions page. A signed store release will be prepared after the desktop deep-link flow is wired and tested.
