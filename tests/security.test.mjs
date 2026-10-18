// Sign-in and account security against a simulated Supabase (no real project is contacted):
// no data before login, no built-in passwords, role required, passwords never stored in the
// payroll data, user management through api/users.js, deactivation, password change, logout.
import { appUnderTest, launch, login, trackPage, Results } from './lib/harness.mjs';
import { MockSupabase, loadApiHandler } from './lib/mock-supabase.mjs';
import { REPO } from './lib/harness.mjs';

const B64 = (s) => Buffer.from(s, 'base64').toString(); // old built-in passwords, kept out of plain text
const OLD_PASSWORDS = [['swadmin', B64('U29mdEFkbWluQDEyMw==')], ['admin', B64('YWRtaW4xMjM=')]];
const R = new Results('Security');
const mock = new MockSupabase({ data: {
  // Data saved by an old version that still carried passwords — they must be stripped on load.
  users: [{ username: 'swadmin', password: 'x-old-1', name: 'Software Administrator', role: 'Software Admin' },
    { username: 'hr.user', password: 'x-old-2', name: 'HR User', role: 'HR' }],
  admin: { username: 'admin', password: 'x-old-3' },
  employees: [{ code: 'EMP001', name: 'Asha Test', status: 'Active', department: 'HR', unit: 'Unit-1', basic: 10000, joining: '2022-01-01' }],
  departments: ['HR'], attendance: {}, payroll: {}, nextEmpNum: 2,
} });
const sa = mock.addAccount('swadmin', 'Str0ngPass!', 'Software Admin');
mock.addAccount('stranger', 'whatever1', null);
const handler = await loadApiHandler(REPO, mock);
const app = await appUnderTest(4311);
const browser = await launch();
try {
  const page = await (await browser.newContext()).newPage();
  const { errors, dialogs } = trackPage(page);
  await mock.attach(page, { apiHandler: handler });
  await page.goto(app.url);
  await page.waitForFunction(() => document.getElementById('loginErr')?.textContent === '');
  R.ok('no payroll data requested before login', !mock.requests.some((x) => x.includes('erp_data')), mock.requests.join(','));
  R.ok('page title is the neutral app name', (await page.title()) === 'Payroll', await page.title());
  const tryLogin = async (u, p) => { await login(page, app.url, u, p); await page.waitForTimeout(600); return page.textContent('#loginErr'); };
  for (const [u, p] of OLD_PASSWORDS) R.ok(`old built-in password for ${u} rejected`, (await tryLogin(u, p)) === 'Invalid username or password.');
  R.ok('account without a role rejected', (await tryLogin('stranger', 'whatever1')).includes('not set up for Payroll'), await page.textContent('#loginErr'));
  await tryLogin('swadmin', 'Str0ngPass!');
  R.ok('Software Admin signs in', await page.isVisible('#app'));
  R.ok('login uses the configured email domain', mock.accounts[0].email === 'swadmin@users.example.com');
  R.ok('passwords stripped from stored data', !JSON.stringify(mock.row).includes('password') && !('admin' in mock.row), JSON.stringify(mock.row.users));
  R.ok('login log written', (mock.row.loginLogs || []).length === 1);
  await page.reload(); await page.waitForSelector('#app', { state: 'visible' });
  R.ok('session survives reload', await page.isVisible('#app'));

  await page.click('.nav-item[data-page="softwareadmin"]'); await page.waitForTimeout(200);
  await page.fill('#u_name', 'Priya Sample'); await page.fill('#u_username', 'Priya.S'); await page.fill('#u_password', 'secret1'); await page.selectOption('#u_role', 'HR');
  await page.click('text=Add User'); await page.waitForTimeout(600);
  R.ok('Auth account created through api/users.js', mock.accounts.some((a) => a.email === 'priya.s@users.example.com' && a.app_metadata.role === 'HR'));
  R.ok('profile saved without password', mock.row.users.some((u) => u.username === 'priya.s' && !('password' in u)));
  await page.fill('#u_name', 'X'); await page.fill('#u_username', 'bob'); await page.fill('#u_password', '123'); await page.click('text=Add User'); await page.waitForTimeout(300);
  R.ok('short password refused', String(dialogs.at(-1)).includes('at least 6'), dialogs.at(-1));

  // api/users.js refuses callers that are not Software Admin, even with a valid token.
  const res = { code: 0, setHeader() {}, status(s) { this.code = s; return this; }, json() { return this; } };
  const hrToken = 'tok-hr'; mock.tokens[hrToken] = mock.accounts.find((a) => a.email.startsWith('priya.s')).id;
  await handler({ method: 'POST', headers: { authorization: `Bearer ${hrToken}` }, body: { action: 'create', username: 'evil', password: 'secret9', role: 'Software Admin' } }, res);
  R.ok('api/users.js rejects a non-admin caller', res.code === 403 && !mock.accounts.some((a) => a.email.startsWith('evil')), res.code);
  await handler({ method: 'POST', headers: {}, body: { action: 'list' } }, res);
  R.ok('api/users.js rejects a call without a token', res.code === 401, res.code);

  await page.click('text=🚪 Logout'); await page.waitForTimeout(500);
  R.ok('logout returns to the login screen', (await page.isVisible('#loginScreen')) && !(await page.isVisible('#app')));
  R.ok('logout time recorded', mock.row.loginLogs.at(-1).logoutTime !== '');
  R.ok('in-memory data cleared on logout', await page.evaluate(() => db.employees.length === 0));
  await tryLogin('priya.s', 'secret1');
  R.ok('HR user signs in', await page.isVisible('#app'));
  R.ok('HR has no Software Admin menu', !(await page.isVisible('.nav-item[data-page="softwareadmin"]')));
  await page.click('text=🚪 Logout'); await page.waitForTimeout(400);

  await tryLogin('swadmin', 'Str0ngPass!');
  await page.click('.nav-item[data-page="softwareadmin"]'); await page.waitForTimeout(200);
  const idx = await page.evaluate(() => db.users.findIndex((u) => u.username === 'priya.s'));
  await page.evaluate((i) => toggleUserActive(i), idx); await page.waitForTimeout(500);
  R.ok('deactivation bans the Auth account', mock.accounts.find((a) => a.email.startsWith('priya.s')).banned === true);
  await page.click('.nav-item[data-page="settings"]'); await page.waitForTimeout(200);
  await page.fill('#s_curPass', 'wrong'); await page.fill('#s_newPass', 'NewPass99'); await page.evaluate(() => changePassword()); await page.waitForTimeout(400);
  R.ok('wrong current password refused', dialogs.at(-1) === 'Current password incorrect.', dialogs.at(-1));
  await page.fill('#s_curPass', 'Str0ngPass!'); await page.fill('#s_newPass', 'NewPass99'); await page.evaluate(() => changePassword()); await page.waitForTimeout(500);
  R.ok('own password changed', sa.password === 'NewPass99', dialogs.at(-1));
  for (const p of ['dashboard', 'employees', 'resigned', 'departments', 'attendance', 'timeentry', 'payroll', 'payrollprocess', 'increment', 'salaryadvance', 'reports', 'settings', 'softwareadmin']) {
    await page.click(`.nav-item[data-page="${p}"]`); await page.waitForTimeout(80);
  }
  await page.click('text=🚪 Logout'); await page.waitForTimeout(400);
  R.ok('deactivated user cannot sign in', (await tryLogin('priya.s', 'secret1')).includes('deactivated'), await page.textContent('#loginErr'));
  await tryLogin('swadmin', 'NewPass99');
  R.ok('sign in with the new password', await page.isVisible('#app'));
  R.ok('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); app.stop();
}
R.summary();
process.exitCode = R.failed ? 1 : 0;
