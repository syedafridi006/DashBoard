DASHIFY — FUNCTIONAL INTEGRATION (v1.2)

Included files
- index.html: responsive Dynamic Island UI, live clock, controls, bookmarks, wallpaper panel and stats panel.
- script.js: live clock, tab switching, outside-click/Escape close, persisted settings and local quick links.
- wallpaper.js: preset selection, custom image upload and saved wallpaper restoration.
- stats.js: website usage reports, periodic hardware/network refresh, browser GPU adapter detection, and manual download/upload speed test.
- background-site-usage.js: Manifest V3 service worker that tracks active HTTP/HTTPS website time and visits locally.
- manifest.json: required permissions and speed-test host permission.

Install/update
1. Extract all files into the same extension folder; do not omit the JavaScript files.
2. Open chrome://extensions/ (Chrome) or edge://extensions/ (Edge).
3. Enable Developer mode if this is a local unpacked extension.
4. Click Reload on Dashify. If Chrome reports new permissions, approve them.
5. Open a new tab. Click the Dynamic Island, then choose a panel.

What updates dynamically
- Compact clock/date refresh every second and follows saved 12/24-hour and seconds settings.
- Network online status refreshes on connectivity changes and every 5 seconds. Downlink/RTT are browser estimates and only appear when the Network Information API is supported.
- CPU/RAM refresh every 2.5 seconds when the browser exposes the required system APIs. Logical processor count is a browser-reported value. GPU adapter name is best-effort; GPU utilization is not exposed by standard extension APIs.
- Website usage is stored locally and checkpointed at least once per minute while an HTTP/HTTPS tab is active in a focused window. It begins tracking after installation/reload; prior browsing history cannot be reconstructed.
- Wallpaper and quick links are saved in chrome.storage.local. Custom wallpapers are limited to 4 MB to avoid exhausting extension storage.
- Speed tests only run when clicked and send test data to Cloudflare's public speed-test endpoint. A successful test needs internet access and endpoint availability.

Important platform limits
A standard browser extension cannot guarantee access to system-wide CPU load, physical RAM usage or GPU utilization on every OS/browser. Dashify shows unavailable status rather than inventing readings. Full system telemetry on a Windows PC may require a separate native helper application and Native Messaging integration.

Validation performed
- JavaScript syntax checks passed for script.js, wallpaper.js, stats.js and background-site-usage.js.
- manifest.json parses; HTML parses with unique IDs and all referenced scripts present.
- These checks do not replace loading and exercising the extension in Chrome/Edge. Verify browser console and chrome://extensions/ service-worker errors if an API or network request is blocked.
