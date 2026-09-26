# Crew salary structure parity

The rupees action was compared with `yugam-source-code/artifacts/yugam/src/features/crew/components/SalaryStructureDialog.tsx`.

Vidhai now loads the latest scoped employee record and available salary templates, shows department and assignment status, restores employee fixed amounts by component ID or legacy name, clears amounts for another template, requires explicit non-negative fixed amounts, and previews monthly/yearly components with calculation descriptions and Total CTC. Settings-authorized users can open Manage Templates directly. Saving is guarded during loading, invalid previews, and in-flight requests; editable dialogs require an explicit Close.

The dialog saves salary template and fixed amounts only, as Yugam does. The former statutory contribution controls are removed from this dialog; saved statutory settings are untouched. An immediate save stores the template structure for the current organization-local month. Payroll uses that snapshot when recalculating that month, while retaining existing paid-payroll locks and snapshots for other months.

Salary reads and template selection require `crew.employees.salary_structure` and employee scope, without requiring Settings access. Updates retain employee update permission and protected-system-employee restrictions.

The permission is registered in the backend action/catalog definitions and exposed in the Roles matrix. The Crew action uses this same permission. Superadmin's wildcard grants it without a role migration; ordinary roles must be granted Salary Structure explicitly. Unknown permissions still fail validation, including for superadmin. The dialog displays server errors instead of masking every failure as an access denial.

Run `pnpm --filter @workspace/api-server run test:salary-structure` for salary calculations and access regression coverage using the real backend permission validator.

Validation: frontend and backend TypeScript checks; salary structure, payroll route, and crew frontend regression tests. Live browser verification was not performed.
