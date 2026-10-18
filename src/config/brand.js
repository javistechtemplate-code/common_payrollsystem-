// Client-neutral branding defaults. Each client deployment sets its own values with environment
// variables (see .env.example); company name / logo shown on slips and reports come from the
// company settings stored in the client's database.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Payroll';
// Files in /public are served as-is; BASE_URL keeps the path correct for any deploy sub-folder.
export const LOGO_SRC = `${import.meta.env.BASE_URL}assets/logo.svg`;
// Login usernames map to Supabase Auth emails on this domain (no email is ever sent).
// Must match LOGIN_EMAIL_DOMAIN used by the server (api/users.js).
export const LOGIN_EMAIL_DOMAIN = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || 'users.example.com';
