# Crew and payroll verification

For the populated application database, logins, scenarios and ERP module coverage, see [Local manual testing](local-manual-testing.md). Its seed command is `pnpm.cmd local:data:seed`.

Run commands from the repository root. On Windows PowerShell use `pnpm.cmd` if execution policy blocks `pnpm.ps1`.

```powershell
pnpm.cmd run typecheck
pnpm.cmd --filter @workspace/scripts run test:crew
# Mockup sandbox requires these even for a build:
$env:PORT = '5173'
$env:BASE_PATH = '/'
pnpm.cmd run build
```

All API test files can be run with the scripts package's TypeScript loader:

```powershell
Set-Location scripts
node --require ./tsx-windows.cjs --import tsx --test ../artifacts/api-server/test/*.test.mjs
```

The integration suite requires local MongoDB at `127.0.0.1:27017` with replica set `rs0`. Every invocation creates its own timestamped `vidhai_crew_audit_*` database and temporary uploads. It does not load the application's `.env` or write to application data. It retains the fixture database for inspection.

## Automated browser checks

Install the pinned browser driver in an ignored tool directory; Chrome must already be installed:

```powershell
npm.cmd install --prefix tmp/browser-tools playwright@1.56.1 --ignore-scripts --no-audit --no-fund
pnpm.cmd --filter @workspace/scripts run test:crew:browser
# Optional visual inspection of the downloaded test PDF:
node scripts/test/inspect-payslip.mjs
```

`PLAYWRIGHT_MODULE` can point to another installed Playwright `index.mjs`. The harness starts its own frontend on port 5189 (or the next free port), proxies to the isolated API, and closes its servers/browser when done. Evidence is written to `docs/qa/browser/`.

The browser harness uses real application pages, authentication, API routes, and MongoDB persistence. Camera frames and geolocation are simulated by Chromium. Face detection is replaced only in the test Vite configuration with `scripts/test/fixtures/browser-face-detector.mjs`; the production build still uses BlazeFace. Reverse-geocoder failure is simulated to check the GPS fallback. These tests cannot certify physical camera quality, face-model accuracy, actual GPS accuracy, or a live external geocoding service.

## Saved comparison fixtures

The Aakash/Nishanth Markdown, JSON and PDF files are saved scenario evidence, not production payroll sign-off. The optional `yugam-source-code/` reference checkout is ignored and is not needed to typecheck, build, or run the tests above. The comparison/render scripts require that checkout when executed. Comparison scripts create/update their named fixtures in the configured database; do not run them against production data.

The September 24 audit is historical. Its calendar-day salary and Other-leave LOP assumptions were superseded by working-day/reference parity. Use the current review report and tests for current behavior.
