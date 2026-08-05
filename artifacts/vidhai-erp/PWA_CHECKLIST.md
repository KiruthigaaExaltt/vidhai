# PWA verification

- Build with the production `BASE_PATH`, serve over valid HTTPS, and confirm HTTP redirects to HTTPS.
- Confirm `manifest.webmanifest` has the deployment start URL/scope and the three Vidhai icons.
- Confirm `sw.js` and the manifest use no-cache headers; hashed `/assets/` files use immutable one-year caching.
- Android/Windows/macOS: install from the browser, launch standalone, and verify routes and authentication remain unchanged.
- iPhone/iPad Safari: Share → Add to Home Screen → Add; verify safe-area spacing in portrait and landscape.
- Load once online, disconnect, then verify only the application shell opens. API-backed business data is intentionally network-only.
- Deploy build A, keep it open, deploy build B, refocus, choose Update App, and verify exactly one reload.
- Stop the network for more than five seconds and verify navigation falls back to the cached shell.
- Verify `/api/*` never appears in Cache Storage.
- Test Repair application while offline and verify it removes only Vidhai-owned caches/service-worker registration.
- Verify manifest, JavaScript, CSS, PNG, WebP, and WOFF2 MIME types and confirm the service worker is never served as HTML.
- Verify any camera/geolocation usage on the HTTPS staging origin and check for mixed-content errors.
