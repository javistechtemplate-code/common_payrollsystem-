// Build + serve helpers and a tiny result recorder shared by the test files.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TEST_ENV = {
  VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
};

// Builds the app in `dir` (a checkout of this repo) into dir/dist.
export function build(dir, env = {}) {
  execFileSync(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'error'],
    { cwd: dir, env: { ...process.env, ...TEST_ENV, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
}

// Serves dir/dist with `vite preview`; resolves to { url, stop }.
export function serve(dir, port) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'],
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let done = false;
    const onData = (d) => { if (!done && /localhost:\d+/.test(String(d))) { done = true; resolve({ url: `http://localhost:${port}/`, stop: () => p.kill() }); } };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('exit', (c) => { if (!done) reject(new Error(`vite preview exited (${c})`)); });
    setTimeout(() => { if (!done) { p.kill(); reject(new Error('vite preview did not start')); } }, 30000);
  });
}

export async function launch() {
  const opts = {};
  if (process.env.PLAYWRIGHT_CHROMIUM) opts.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
  return chromium.launch(opts);
}

export async function login(page, url, username, password) {
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('loginErr') && document.getElementById('loginErr').textContent === '');
  await page.fill('#loginUser', username);
  await page.fill('#loginPass', password);
  await page.click('#loginStepCreds .loginSubmit');
}

// Stubs window.open so print windows (slips, reports) can be captured as HTML.
export async function capturePrintWindows(page) {
  await page.addInitScript(() => {
    window.__printed = [];
    window.open = () => {
      const doc = { html: '', write(h) { this.html += h; }, close() { window.__printed.push(this.html); } };
      return { document: doc, focus() {}, print() {}, close() {}, addEventListener() {}, onload: null };
    };
  });
}

export class Results {
  constructor(name) { this.name = name; this.rows = []; }
  ok(label, cond, extra = '') {
    this.rows.push({ label, pass: !!cond, extra: String(extra || '') });
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra && !cond ? `  — ${String(extra).slice(0, 400)}` : ''}`);
  }
  get passed() { return this.rows.filter((r) => r.pass).length; }
  get failed() { return this.rows.filter((r) => !r.pass).length; }
  summary() { console.log(`\n${this.name}: ${this.passed}/${this.rows.length} passed`); return { name: this.name, passed: this.passed, total: this.rows.length }; }
}

export function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

// URL of the app under test: TEST_APP_URL when tests/run-all.mjs already built and served it,
// otherwise build this checkout and serve it on `port`.
export async function appUnderTest(port) {
  if (process.env.TEST_APP_URL) return { url: process.env.TEST_APP_URL, stop() {} };
  build(REPO);
  return serve(REPO, port);
}

export function trackPage(page) {
  const errors = []; const dialogs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(d.type() === 'prompt' ? '' : undefined); });
  return { errors, dialogs };
}
