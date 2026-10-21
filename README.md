# Payroll — Reusable Template

A payroll / HR application (employees, attendance, time entry, payroll, salary
advance, statutory PF/ESI/bonus reports, salary slips, user rights) that can be deployed
separately for each client. It contains **no company identity, company data or credentials**:
every client gets its own Supabase project and Vercel deployment, configured only through
environment variables.

> **Status: Phase 2 (identity removed, regression tests added).** Storage is still the single
> `erp_data` JSON row. The relational database with per-role security (Manager / HR /
> Accountant), Company Information, audit logs and the Resigned Staff workflow come in later
> phases.

## Run locally

```bash
npm ci
cp .env.example .env    # then fill in your own development project's values
npm run dev             # http://localhost:5173
npm run build           # production build in dist/
npm run preview         # serve dist/ locally
npm test                # regression tests (see Testing)
```

`npm run dev` does not run the `api/` server function, so adding/editing users only works on
Vercel (or locally with `npx vercel dev`).

## Configuration (environment variables)

All values are per client. `.env.example` lists them with placeholders only — never commit a
real `.env`.

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | The client's Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | The project's **Publishable** key (safe in the browser) |
| `VITE_APP_NAME` | browser | Name shown in the title, backups and the import template (default `Payroll`) |
| `VITE_LOGIN_EMAIL_DOMAIN` | browser | Usernames map to `<username>@<domain>` in Supabase Auth (default `users.example.com`) |
| `SUPABASE_URL` | server | Same project URL, used by `api/users.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | server | The **secret** key — server only, never in browser code |
| `LOGIN_EMAIL_DOMAIN` | server | Must equal `VITE_LOGIN_EMAIL_DOMAIN` |

The company name, address, logo, units and contractors are entered inside the app
(**Software Admin → Company Details**), not in code.

## New client deployment (current storage)

1. Create a Supabase project for the client. **SQL Editor:** run `supabase/setup.sql`.
2. **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up".
3. **Authentication → Users → Add user:** `<username>@<LOGIN_EMAIL_DOMAIN>`, a strong password,
   **Auto Confirm User** ticked; then run the commented `update auth.users …` statement at the
   end of `supabase/setup.sql` with that email to make it the first Software Admin.
4. Create a Vercel project from the client's branch and set the variables above (Production and
   Preview). Redeploy, sign in, and create everyone else from **User Management**.

There are no built-in accounts or default passwords.

## Branches and releases

| Branch | Use |
|---|---|
| `source` | Generic template development |
| `test` | Integration and regression testing (`source` → `test` pull request) |
| `main` | Approved releases only (`test` → `main` after review) |
| `client/<client-name>` | One per client, created from a released `main`; only client configuration/branding |

Tag each approved release on `main` (`v1.0.0`, `v1.1.0`, …). To roll a client back, redeploy
the previous tag in Vercel (or reset the client branch to it); database changes from later
phases will ship with their own forward/rollback scripts.

## Testing

```bash
npm test                      # everything below
npm run test:scan             # identity / secret scan of the repository and dist/
node tests/golden-master.test.mjs [baseline-ref]
```

The browser tests use Playwright (Chromium) against a **simulated Supabase** in the test process
(`tests/lib/mock-supabase.mjs`) and synthetic data (`tests/lib/fixtures.mjs`) — they never contact
a real project. Set `PLAYWRIGHT_CHROMIUM=/path/to/chrome` to use a specific browser binary.

| Test | Checks |
|---|---|
| `tests/scan-identity.mjs` | No original company identity, old default logins, keys or real project URLs; `.env.example` has placeholders only |
| `tests/golden-master.test.mjs` | Builds the baseline commit (`b5d9ffc`, the app as copied from the original project) and this checkout, runs both on the same synthetic company and compares payroll figures for two months, every page (incl. attendance views and time-entry tabs), every report screen, every report PDF and Excel export, the Contractors Bill, pay slips by unit / contractor, the Excel template and an import |
| `tests/security.test.mjs` | Sign-in, roles, password stripping, user management API, deactivation, password change, logout |
| `tests/bulk-import.test.mjs` | Excel template = form fields, upload review, import, records match manual entry |
| `tests/units.test.mjs` | Unit numbering everywhere: list, form, attendance, slips, reports, Software Admin, Excel |

Results and the files each test produced are written to `tests/output/` (git-ignored).

## Project structure

```
index.html                     Entry page: React root + ordered <script> tags for the modules
api/users.js                   Vercel server function: creates/updates/deletes login accounts
supabase/setup.sql             Database table + security rules (RLS) + first-admin statement
src/
  main.jsx                     Renders the React shell, loads the CSS
  App.jsx                      Login screen + app shell + modal
  components/
    LoginScreen.jsx            Username/password sign-in
    AppShell.jsx               Sidebar + topbar + #pageBody page area
    Sidebar.jsx                Logo and navigation menu
    Topbar.jsx                 Page title, colour theme picker, dark/light, logout
    ModalOverlay.jsx           Shared popup container
  config/
    navigation.js              Sidebar menu items (edit here to add/rename a menu)
    brand.js                   App name (VITE_APP_NAME) and login email domain
  legacyBridge.js              Lets React call the module functions safely
  features/employee-import/    Employee Bulk Import (Excel)
    BulkImportDialog.jsx       Download template / upload / review / import dialog
    employeeColumns.js         Builds sheet columns from the employee field list + row checks
    excel.js                   Builds the template and reads uploaded files (ExcelJS)
  styles/
    index.css                  Imports all CSS in the correct order
    shell.css                  Styles of the React shell components
    legacy/01..08-*.css        Original stylesheet, split by module
public/
  legacy/01..30-*.js           ERP business logic, one file per module
tests/                         Regression tests (see Testing)
```

### JS modules (`public/legacy/`)

| File | Module |
|---|---|
| 01-supabase-db.js | Supabase config, load/save database, startup data migration |
| 02-permissions.js | Roles and per-module user rights |
| 03-company-logo-status.js | Company logo upload, attendance status constants |
| 04-auth-theme.js | Supabase Auth login/logout, session restore, dark mode and colour theme |
| 05-navigation.js | Sidebar click handling and `render(page)` page router |
| 06-helpers.js | Formatting, dates, salary helpers, amount in words |
| 07-dashboard.js | Dashboard |
| 06b-units.js | Working units list and helpers (unitLabel, unitAddress, …) |
| 06c-contractors.js | Contractors list (who supplies employees) and helpers |
| 07b-employee-fields.js | The employee field list: draws the form and defines the bulk-import template columns |
| 08-employees.js | Employees, resigned employees, rejoin, employee form, bulk import hooks |
| 09-departments.js | Departments |
| 10-attendance.js | Attendance (day view, employee-wise monthly, holidays) |
| 11-salary-advance.js | Salary advance and recovery schedule |
| 12-payroll-calc.js | Per-employee payroll calculation |
| 13-time-entry.js, 14-time-entry-grid.js, 14b-time-entry-datewise.js | Employee time entry (date-wise, employee-wise, leave, holidays, summary); attendance, late and OT come from here |
| 15-payroll.js, 16-payroll-process.js | Payroll screen and payroll constants |
| 16b-contractor-bill.js | Contractors Bill (service charge and company payable per contractor) |
| 18-salary-slip.js | Salary slips and bulk printing |
| 19-reports.js | Report list and report screens |
| 20–24 | Acquittance register, bonus, experience, ESI, PF reports |
| 25-print-reports.js | Print/PDF windows for reports |
| 26-settings.js, 27-software-admin.js | Admin and Software Admin pages |
| 28-user-rights-backup.js | User rights panel, backup/restore, auto-backup |
| 29-user-management.js, 30-modal.js | User management, modal open/close |

## How the pieces fit (read before changing things)

- The module files are classic scripts that share one global scope, exactly like the original
  single `<script>`. Their **order in `index.html` matters** — keep it when adding files.
- Pages are still built by the module code as HTML strings and written into `#pageBody` by
  `render(page)`; buttons inside pages call global functions through `onclick="..."`.
- React renders the shell **once** (login, sidebar, topbar, modal). The module code then controls
  those elements by their ids/classes, so do not rename ids like `loginUser`, `pageBody`,
  `overlay`, `themePicker`, or the `nav-item` / `data-page` attributes.
- To convert a page to React later: build it as a component, mount it into `#pageBody` from
  `render(page)` for that page, and move that page's functions out of `public/legacy/`.

Only one line of logic changed in the original split: the auto-backup start check in
`28-user-rights-backup.js`, because deferred scripts run when `document.readyState` is already
`'interactive'`. Without the change the watcher would start twice.

## Employee Bulk Import

**Software Admin → Bulk Import (Excel)** adds new employees from an Excel sheet: **Download
Template** gives a sheet with the same columns as the Add Employee form (A1 = S.No, header row
locked, dropdowns with a "None" choice, grey calculated columns for Basic / HRA / OT rate);
**Upload Excel** checks every row and shows it before anything is added. Other users add employees
one at a time with **Employees → + Add Employee**. Imported employees are edited later through ✏️ Edit.

### Changing employee fields

All employee fields are defined once, in `employeeFields()` in
`public/legacy/07b-employee-fields.js`. That one list draws the Add / Edit Employee form, saves it,
and defines the Excel template columns, dropdowns and import. Add, rename, reorder or remove a field
there and the form and the template change together. A template downloaded before a change is
refused on upload (the columns no longer match) — download a new one.

## Working units and contractors

Units are one list, `db.units` (`public/legacy/06b-units.js`), always shown with their number and
the first word of the Company Name in front (`ACME Unit-1`). A new installation starts with
Unit-1 … Unit-6; more are added, and empty ones deleted, in **Software Admin → Company Details**,
where each unit's address is set. Contractors (`db.contractors`, `06c-contractors.js`) are a
separate list of who supplies employees; a new installation starts with none and they are added
in the same place.
