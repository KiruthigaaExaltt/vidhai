# Demo readiness review — 28 September 2026

Verdict: not an all-clear. Functional print/duplicate defects were found. Application source was not changed by this review.

## Confirmed findings

1. **Multi-item purchase requests print only the first item.** The print handler uses the legacy `itemName`, `quantity`, and `unit` fields, while creation stores all items in `lineItems` and copies only the first into those fields. See `artifacts/vidhai-erp/src/pages/flex/purchase-requests.tsx:681` and `:801`.
2. **GRN print omits all received items and quantities.** The entire generated document contains only document/vendor/reference/date/status metadata. See `artifacts/vidhai-erp/src/pages/flex/goods-receipts.tsx:686`.
3. **Purchase order and purchase invoice prints are summaries rather than full item documents.** PO output has one description/subtotal/grand-total row without individual quantities, rates or taxes. Purchase invoice output has a single invoice/PO/GRN matching summary. See `artifacts/vidhai-erp/src/pages/flex/purchase-orders.tsx:603` and `artifacts/vidhai-erp/src/pages/flex/purchase-invoices.tsx:584`.
4. **Sales PDF totals enter the fixed footer area.** An executed 10-item fixture generated summary text at y=147 and totals at y=130, 115, 100, 85, while the bank/terms footer starts at y=150 with text at y=135,119,106,93,76. Long bank details collide with totals. Pagination always uses ten rows and does not reserve final-page summary space. See `artifacts/vidhai-erp/src/pages/sales/utils/salesPdf.ts:272` onward. This was verified from generated PDF drawing commands; visual rendering was unavailable. The same generator also drops non-ASCII text and truncates terms to four lines.
5. **Duplicate requests/orders do not reliably copy their line items.** Duplicate PR replaces the item list with the first legacy item only. Duplicate PO does not set line items or clear the editing state, so it can retain form state from previous use. See `artifacts/vidhai-erp/src/pages/flex/purchase-requests.tsx:651` and `artifacts/vidhai-erp/src/pages/flex/purchase-orders.tsx:584`.
6. **PO Send falsely says its PDF was downloaded.** The send-dialog setup prepares recipient/message state but performs no PDF generation/download. See `artifacts/vidhai-erp/src/pages/flex/purchase-orders.tsx:228` and `:1452`.
7. **Demo packaging is not configured in this checkout.** `node scripts/build-environment.mjs demo --check` fails because the frontend `.env.demo` is missing. Neither frontend nor backend has `.env.demo`. This blocks the dedicated demo package command, not the successful ordinary local builds.

## Checks completed

- Frontend and API TypeScript checks: passed.
- Frontend production build and API build: passed.
- Existing Node regression suite: **235 passed, 7 failed, 242 total**. See `demo-audit-tests.log`.
- The seven failures are inconsistent test fixtures/expectations: five reference `Client A` while their shared fixture names that client `AK-MUSHROOMS`; two expect nameless Credit transactions to succeed although current UI/API require a contact. These do not establish seven application defects. Tests were not modified to turn them green.
- Isolated live API harness: **19 groups passed**, covering templates, encrypted login, user creation, photo/location validation and storage, self-service attendance, duplicate punch rejection, HR permissions, employee validation, leave limits, overtime approval and payroll inclusion, LOP, payroll recalculation, and cookie session restoration/logout.
- Existing salary PDF render regression: passed. This checks PDF generation, not visual print layout.
- Existing inventory, account posting/payment, salary, attendance, encryption and packaging checks were included in the Node suite; coverage is limited to their fixtures.
- `git diff --check`: passed.

The API harness created and retained the isolated local database `vidhai_crew_audit_1790574181592`; it did not use the application database. Builds refreshed generated local build outputs.

## Not verified

No browser was connected (browser discovery returned an empty list). Consequently no complete browser walkthrough, native print preview, camera/GPS hardware check, actual WhatsApp interaction, client-hosted deployment check, or comprehensive end-to-end production/sales/procurement lifecycle was performed. Poppler was unavailable for visual PDF rendering. Passing builds and regression tests cannot certify every application flow.

Before a client demo involving these features, repair the confirmed print/duplicate issues and complete a browser walkthrough of the exact demo scenarios on the target environment.
