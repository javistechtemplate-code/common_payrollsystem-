// Shown only until the company name/logo saved in Software Admin is known (see
// applyCompanyBranding() in public/legacy/03-company-logo-status.js, which also hides the
// logo badge while there is no company logo).
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Payroll';
// Login usernames map to Supabase Auth emails on this domain (no email is ever sent).
// Must match LOGIN_EMAIL_DOMAIN used by the server (api/users.js).
export const LOGIN_EMAIL_DOMAIN = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || 'users.example.com';
