// Golden-master regression: builds the baseline commit (the app as copied from the original
// project) and the current checkout, runs both against the same synthetic company, and checks
// that payroll figures, every page, every salary slip / report printout and the Excel template
// and import are identical. The only differences allowed are the removed identity (app name,
// logo file, template file name), which are normalized before comparing.
//
//   node tests/golden-master.test.mjs [baselineRef]      (default: GOLDEN_BASELINE or 15dce7c)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { REPO, build, serve, launch, capturePrintWindows, login, Results, writeJson } from './lib/harness.mjs';
import { MockSupabase } from './lib/mock-supabase.mjs';
import { syntheticCompany, MONTHS, FIXED_NOW } from './lib/fixtures.mjs';

const BASE_REF = process.argv[2] || process.env.GOLDEN_BASELINE || '15dce7c';
const OUT = path.join(REPO, 'tests/output/golden-master');
const PAGES = ['dashboard', 'employees', 'resigned', 'departments', 'attendance', 'timeentry', 'payroll', 'payrollprocess',
  'increment', 'salaryadvance', 'reports', 'settings', 'softwareadmin'];
const BASE_DOMAIN = Buffer.from('dXNlcnMudmlwbC1wYXlyb2xsLmFwcA==', 'base64').toString(); // login domain hard-coded in the baseline build
const B64 = (s) => Buffer.from(s, 'base64').toString(); // keeps old identity strings out of grep results
const NORMALIZE = [
  [new RegExp(B64('VklQTCBQYXlyb2xs'), 'g'), 'Payroll'],
  [new RegExp(B64('VklQTA=='), 'g'), 'Payroll'],
  [new RegExp(`assets/(${B64('dmlwbA==')}-logo\\.png|logo\\.svg)`, 'g'), 'assets/LOGO'],
];
const norm = (s) => NORMALIZE.reduce((t, [re, to]) => t.replace(re, to), String(s));

async function excelSummary(file) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const sheets = {};
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => rows.push([n, row.values.map((v) => (v instanceof Date ? v.toISOString() : v))]));
    sheets[ws.name] = { rows, validations: ws.dataValidations.model, protection: !!ws.sheetProtection,
      cols: (ws.columns || []).map((c) => ({ w: c.width, locked: c.style?.protection?.locked, fmt: c.numFmt })), state: ws.state };
  });
  return JSON.parse(norm(JSON.stringify(sheets)));
}

async function collect(appDir, url, domain, tag) {
  const mock = new MockSupabase({ emailDomain: domain, data: syntheticCompany() });
  mock.addAccount('swadmin', 'Golden#Pass1', 'Software Admin');
  const browser = await launch();
  const ctx = await browser.newContext({ acceptDownloads: true, timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await mock.attach(page);
  await capturePrintWindows(page);
  await login(page, url, 'swadmin', 'Golden#Pass1');
  await page.waitForSelector('#app', { state: 'visible' });

  const out = { payroll: {}, pages: {}, reports: {}, prints: {}, slips: {}, errors, dialogs };
  for (const ym of MONTHS) {
    out.payroll[ym] = await page.evaluate((m) => {
      payMonth = m; generatePayroll();
      const rec = JSON.parse(JSON.stringify(db.payroll[m]));
      Object.values(rec).forEach((r) => delete r.generatedAt);
      return rec;
    }, ym);
  }
  for (const ym of MONTHS) {
    await page.evaluate((m) => { payMonth = m; attMonth = m; window.__printed = []; }, ym);
    for (const p of PAGES) out.pages[`${ym}/${p}`] = await page.evaluate((pg) => { render(pg); return document.getElementById('pageBody').innerHTML; }, p);
    const keys = await page.evaluate(() => REPORTS_LIST.map((r) => r.key));
    for (const k of keys) {
      out.reports[`${ym}/${k}`] = await page.evaluate((key) => { openReport(key); return document.getElementById('pageBody').innerHTML; }, k);
      out.prints[`${ym}/report:${k}`] = await page.evaluate((key) => { window.__printed = []; downloadReportPDF(key); return window.__printed.join('\n'); }, k);
    }
    await page.evaluate(() => closeReport());
    for (const u of await page.evaluate(() => getUnits().map((x) => x.code))) {
      out.prints[`${ym}/slips:${u}`] = await page.evaluate((c) => { window.__printed = []; render('payroll'); printAllSlips(c); return window.__printed.join('\n'); }, u);
    }
    for (const code of ['EMP001', 'EMP004', 'EMP010', 'EMP023', 'EMP024']) {
      out.slips[`${ym}/${code}`] = await page.evaluate(([c, m]) => { openSlip(c, m); const h = document.getElementById('modalContent').innerHTML; closeModal(); return h; }, [code, ym]);
    }
  }
  out.db = await page.evaluate(() => JSON.parse(JSON.stringify(db)));

  // Excel template download + import through the real dialog.
  await page.evaluate(() => render('employees'));
  await page.click('text=+ Add Employee');
  await page.click('.addEmpChoice >> text=Bulk Import');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download Template')]);
  fs.mkdirSync(path.join(OUT, tag), { recursive: true });
  const tpl = path.join(OUT, tag, 'template.xlsx'); await dl.saveAs(tpl);
  out.templateFileName = dl.suggestedFilename();
  out.template = await excelSummary(tpl);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(tpl); const ws = wb.getWorksheet('Employees');
  const H = {}; ws.getRow(1).eachCell((c, n) => { H[c.value] = n; });
  const put = (r, h, v) => { ws.getRow(r).getCell(H[h]).value = v; };
  put(2, 'Full Name *', 'Import One'); put(2, 'Department', 'Production'); put(2, 'Joining Date', new Date(Date.UTC(2026, 3, 6)));
  put(2, 'Basic Salary', 15000); put(2, 'HRA', 3000); put(2, 'Working Unit', 'Unit-3 - TEST UNIT 3'); put(2, 'Payment Mode', 'CASH');
  put(3, 'Full Name *', 'Import Two'); put(3, 'Department', 'HR'); put(3, 'PF Deduction', 'Nil'); put(3, 'ESI Deduction', 'Exempted'); put(3, 'Working Unit', 'Unit-2');
  put(4, 'Full Name *', 'Import Bad'); put(4, 'Department', 'NoSuchDept');
  const filled = path.join(OUT, tag, 'employees-filled.xlsx'); await wb.xlsx.writeFile(filled);
  await page.setInputFiles('.bulkImportModal input[type=file]', filled);
  await page.waitForSelector('.bulkImportTable');
  out.importReview = await page.$eval('.bulkImportModal', (e) => e.innerText);
  await page.click('text=Import 2 employees');
  await page.waitForSelector('.bulkImportDone');
  out.imported = mock.row.employees.slice(-2);
  out.savedDb = JSON.parse(JSON.stringify(mock.row));
  await browser.close();
  return out;
}

function diffKeys(a, b, prefix = '') {
  const diffs = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const x = a?.[k], y = b?.[k];
    if (x && y && typeof x === 'object' && typeof y === 'object') diffs.push(...diffKeys(x, y, `${prefix}${k}.`));
    else if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`${prefix}${k}: ${JSON.stringify(x)?.slice(0, 120)} ≠ ${JSON.stringify(y)?.slice(0, 120)}`);
  }
  return diffs;
}
function firstDiff(a, b) {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}: «${a.slice(Math.max(0, i - 80), i + 120)}» vs «${b.slice(Math.max(0, i - 80), i + 120)}»`;
}

const R = new Results('Golden master (baseline vs template)');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-baseline-'));
execFileSync('git', ['worktree', 'add', '--detach', baseDir, BASE_REF], { cwd: REPO, stdio: 'ignore' });
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(baseDir, 'node_modules'));
let srvA, srvB;
try {
  build(baseDir); build(REPO);
  srvA = await serve(baseDir, 4301); srvB = await serve(REPO, 4302);
  const A = await collect(baseDir, srvA.url, BASE_DOMAIN, 'baseline');
  const B = await collect(REPO, srvB.url, 'users.example.com', 'template');
  writeJson(path.join(OUT, 'baseline.json'), A); writeJson(path.join(OUT, 'template.json'), B);

  const empCount = Object.keys(A.payroll[MONTHS[0]]).length + Object.keys(A.payroll[MONTHS[1]]).length;
  R.ok(`fixture produced payroll rows (${empCount} employee-months)`, empCount >= 40, empCount);
  for (const ym of MONTHS) {
    const d = diffKeys(A.payroll[ym], B.payroll[ym]);
    const net = Object.values(B.payroll[ym]).reduce((s, r) => s + r.netSalary, 0);
    R.ok(`payroll ${ym}: every figure identical (${Object.keys(B.payroll[ym]).length} employees, net ₹${net})`, d.length === 0, d.slice(0, 5).join(' | '));
  }
  const cmpGroup = (label, a, b) => {
    const keys = Object.keys(a);
    const bad = keys.filter((k) => norm(a[k]) !== norm(b[k]));
    const empty = keys.filter((k) => !String(a[k]).trim());
    R.ok(`${label}: ${keys.length - bad.length}/${keys.length} identical`, bad.length === 0 && keys.length === Object.keys(b).length,
      bad.slice(0, 3).map((k) => `${k} ${firstDiff(norm(a[k]), norm(b[k]))}`).join(' || '));
    return empty;
  };
  cmpGroup('pages (13 nav pages × 2 months)', A.pages, B.pages);
  cmpGroup('report screens (16 reports × 2 months)', A.reports, B.reports);
  const emptyPrints = cmpGroup('printouts (slips per unit + report PDFs)', A.prints, B.prints);
  R.ok('printouts were actually produced', Object.keys(A.prints).length - emptyPrints.length >= 30, `empty: ${emptyPrints.join(',')}`);
  cmpGroup('individual salary slips', A.slips, B.slips);
  const strip = (d) => { const c = JSON.parse(norm(JSON.stringify(d))); delete c.unitsVersion; (c.loginLogs || []).forEach((l) => delete l.id); return c; };
  const dbDiff = diffKeys(strip(A.savedDb), strip(B.savedDb));
  R.ok('saved database identical after all steps', dbDiff.length === 0, dbDiff.slice(0, 5).join(' | '));
  const tDiff = diffKeys(A.template, B.template);
  R.ok('Excel template identical (headers, dropdowns, protection, Instructions)', tDiff.length === 0, tDiff.slice(0, 5).join(' | '));
  R.ok('Excel template file name only differs by app name', norm(A.templateFileName) === norm(B.templateFileName) && !new RegExp(B64('dmlwbA=='), 'i').test(B.templateFileName), `${A.templateFileName} → ${B.templateFileName}`);
  R.ok('import review identical', norm(A.importReview) === norm(B.importReview), firstDiff(norm(A.importReview), norm(B.importReview)));
  const impDiff = diffKeys(A.imported, B.imported);
  R.ok('imported employee records identical', impDiff.length === 0 && B.imported.length === 2, impDiff.slice(0, 5).join(' | '));
  R.ok('baseline: no page errors', A.errors.length === 0, A.errors.join(' | '));
  R.ok('template: no page errors', B.errors.length === 0, B.errors.join(' | '));
  R.ok('same alerts/confirms shown', JSON.stringify(A.dialogs.map(norm)) === JSON.stringify(B.dialogs.map(norm)), `${JSON.stringify(A.dialogs)} vs ${JSON.stringify(B.dialogs)}`);
} finally {
  srvA?.stop(); srvB?.stop();
  try { execFileSync('git', ['worktree', 'remove', '--force', baseDir], { cwd: REPO, stdio: 'ignore' }); } catch { /* already gone */ }
}
const s = R.summary();
writeJson(path.join(OUT, 'result.json'), { ...s, rows: R.rows });
process.exitCode = R.failed ? 1 : 0;
