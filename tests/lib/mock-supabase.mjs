// In-memory stand-in for a Supabase project, used by the browser tests.
// Covers what the app uses today: Auth (password sign-in, user, logout), the single `erp_data`
// row with an RLS-like rule (only accounts with a role may read/write), and the Auth admin API
// used by api/users.js. Nothing here talks to a real Supabase project.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const SUPABASE_UMD = require.resolve('@supabase/supabase-js/dist/umd/supabase.js');

let idCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;

export class MockSupabase {
  constructor({ emailDomain = 'users.example.com', data = null } = {}) {
    this.emailDomain = emailDomain;
    this.accounts = [];
    this.tokens = {};
    this.row = data;           // the erp_data JSON (null = no row yet)
    this.requests = [];
  }

  email(username) { return `${username}@${this.emailDomain}`; }

  addAccount(username, password, role, { banned = false } = {}) {
    const a = { id: uuid(), email: this.email(username), password, banned,
      app_metadata: role ? { role, username } : {} };
    this.accounts.push(a);
    return a;
  }

  userOf(auth) { return this.accounts.find((a) => a.id === this.tokens[String(auth || '').replace(/^Bearer /, '')]); }

  static pub(a) {
    return { id: a.id, aud: 'authenticated', role: 'authenticated', email: a.email,
      app_metadata: a.app_metadata, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  }

  // Global fetch used by api/users.js (Auth admin endpoints) when it runs inside the test process.
  installServerFetch() {
    const self = this;
    globalThis.fetch = async (input, init = {}) => {
      const u = new URL(typeof input === 'string' ? input : input.url);
      const m = (init.method || 'GET').toUpperCase();
      const h = init.headers instanceof Headers ? Object.fromEntries(init.headers) : (init.headers || {});
      const J = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
      const body = init.body ? JSON.parse(init.body) : {};
      if (u.pathname === '/auth/v1/user') { const a = self.userOf(h.Authorization || h.authorization); return a ? J(200, MockSupabase.pub(a)) : J(401, { msg: 'bad jwt' }); }
      if (u.pathname === '/auth/v1/admin/users' && m === 'GET') return J(200, { users: self.accounts.map(MockSupabase.pub) });
      if (u.pathname === '/auth/v1/admin/users' && m === 'POST') {
        const a = { id: uuid(), email: body.email, password: body.password, app_metadata: body.app_metadata,
          banned: !!body.ban_duration && body.ban_duration !== 'none' };
        self.accounts.push(a); return J(200, MockSupabase.pub(a));
      }
      const mm = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/);
      if (mm) {
        const i = self.accounts.findIndex((a) => a.id === mm[1]);
        if (m === 'DELETE') { self.accounts.splice(i, 1); return J(200, {}); }
        const a = self.accounts[i];
        if (body.password) a.password = body.password;
        if (body.app_metadata) a.app_metadata = body.app_metadata;
        if (body.ban_duration) a.banned = body.ban_duration !== 'none';
        return J(200, MockSupabase.pub(a));
      }
      return J(404, {});
    };
  }

  // Routes a Playwright page's Supabase / CDN / api traffic to this mock.
  async attach(page, { apiHandler = null } = {}) {
    await page.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', path: SUPABASE_UMD }));
    // Google Fonts are optional styling; keep tests offline and deterministic.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    if (apiHandler) {
      await page.route('**/api/users', async (r) => {
        const req = r.request(); let st = 200; let js;
        const res = { setHeader() {}, status(s) { st = s; return this; }, json(j) { js = j; return this; } };
        await apiHandler({ method: req.method(), headers: { authorization: req.headers().authorization }, body: JSON.parse(req.postData() || '{}') }, res);
        r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(js) });
      });
    }
    await page.route('**/*.supabase.co/**', async (r) => {
      const req = r.request(); const u = new URL(req.url()); const auth = req.headers().authorization;
      this.requests.push(`${req.method()} ${u.pathname}`);
      const J = (s, b) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
      if (u.pathname === '/auth/v1/token') {
        const b = JSON.parse(req.postData());
        const a = this.accounts.find((x) => x.email === b.email && x.password === b.password);
        if (!a) return J(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' });
        if (a.banned) return J(400, { error: 'user_banned', msg: 'User is banned', code: 'user_banned' });
        const t = `tok${Math.random()}`; this.tokens[t] = a.id;
        return J(200, { access_token: t, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r${t}`, user: MockSupabase.pub(a) });
      }
      if (u.pathname === '/auth/v1/user') {
        const a = this.userOf(auth); if (!a) return J(401, { msg: 'bad jwt' });
        if (req.method() === 'PUT') a.password = JSON.parse(req.postData()).password;
        return J(200, MockSupabase.pub(a));
      }
      if (u.pathname === '/auth/v1/logout') return r.fulfill({ status: 204, body: '' });
      if (u.pathname === '/rest/v1/erp_data') {
        const a = this.userOf(auth); const staff = a && a.app_metadata && a.app_metadata.role;
        if (req.method() === 'GET') {
          const single = (req.headers().accept || '').includes('vnd.pgrst.object');
          if (!staff || !this.row) return J(200, single ? null : []);
          return J(200, single ? { data: this.row } : [{ data: this.row }]);
        }
        if (!staff) return J(403, { code: '42501', message: 'new row violates row-level security policy for table "erp_data"' });
        const b = JSON.parse(req.postData()); this.row = (Array.isArray(b) ? b[0] : b).data;
        return J(201, []);
      }
      return J(404, {});
    });
  }
}

// Loads api/users.js from an app directory with this mock's credentials.
export async function loadApiHandler(appDir, mock) {
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.LOGIN_EMAIL_DOMAIN = mock.emailDomain;
  mock.installServerFetch();
  const mod = await import(path.join(appDir, 'api/users.js') + `?t=${Date.now()}`);
  return mod.default;
}
