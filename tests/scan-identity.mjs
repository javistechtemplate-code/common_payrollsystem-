// Scans every file in the repository (tracked + new, excluding .gitignore'd ones) and the built
// dist/ for the original company's identity, real-project connection details and secrets.
// The search terms are base64-encoded so this file does not match itself.
//   node tests/scan-identity.mjs        exit code 1 if anything is found
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, Results } from './lib/harness.mjs';

const B64 = (s) => Buffer.from(s, 'base64').toString();
const IDENTITY = ['dmlwbA==', 'dmlzYWxhbQ==', 'dmVsLWFubmE=', 'dmVsIGFubmE=', 'a2Fra2FsdXI=', 'dGhpcnV2YWxsdXI=', 'c3VuIGdyb3Vw', 'am95IHNocmVl',
  'cyBtIHMgY29udA==', 'ZmhwZnhwaWJxdnJleW1oemhkeHQ=', 'dHFmbnR3aWhydW9kZGdnbHd3ZXo='].map(B64);
const OLD_DEFAULT_LOGINS = ['c3dhZG1pbkAxMjM=', 'c29mdGFkbWluQDEyMw==', 'YWRtaW4xMjM=', 'aHJAMTIzNA==', 'YWNjQDEyMzQ=', 'dmlld0AxMjM0'].map(B64);
const SECRETS = [
  ['JWT / legacy Supabase key', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Supabase publishable key', /sb_publishable_[A-Za-z0-9_-]{10,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['real Supabase project URL', /https:\/\/(?!test-project\.|your-project\.|<)[a-z0-9]{20}\.supabase\.co/],
  ['Postgres connection string with password', /postgres(ql)?:\/\/[^:\s]+:[^@\s<]+@/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
];
const SKIP = /\.(png|jpe?g|gif|ico|xlsx|woff2?|ttf|pdf)$|^package-lock\.json$/;

function files() {
  const list = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: REPO }).toString().split('\0').filter(Boolean);
  const dist = path.join(REPO, 'dist');
  if (fs.existsSync(dist)) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(REPO, path.join(d, e.name))]));
    list.push(...walk(dist));
  }
  return list.filter((f) => !SKIP.test(f) && fs.existsSync(path.join(REPO, f)));
}

const R = new Results('Identity / secret scan');
const hits = [];
const all = files();
for (const f of all) {
  const text = fs.readFileSync(path.join(REPO, f), 'utf8');
  const lower = text.toLowerCase();
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  for (const term of [...IDENTITY, ...OLD_DEFAULT_LOGINS]) {
    const i = lower.indexOf(term);
    if (i >= 0) hits.push(`${f}:${lineOf(i)} identity/default-login term #${[...IDENTITY, ...OLD_DEFAULT_LOGINS].indexOf(term)}`);
  }
  for (const [label, re] of SECRETS) {
    const m = re.exec(text);
    if (m) hits.push(`${f}:${lineOf(m.index)} ${label}`);
  }
}
R.ok(`scanned ${all.length} files (repository + dist/) — no company identity, old default logins or secrets`, hits.length === 0, hits.join('\n'));

const envEx = fs.readFileSync(path.join(REPO, '.env.example'), 'utf8');
const values = envEx.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split('=').slice(1).join('='));
R.ok('.env.example holds placeholders only', values.length > 0 && values.every((v) => v === '' || /^(<.*>|your-|https:\/\/your-project|Payroll$|users\.example\.com$)/.test(v)), values.join(' | '));
const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: REPO }).toString().split('\n');
R.ok('no .env file is committed', !tracked.some((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')));
R.summary();
process.exitCode = R.failed ? 1 : 0;
