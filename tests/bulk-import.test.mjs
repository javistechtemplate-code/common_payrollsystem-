// Employee Bulk Import: Add Manually / Bulk Import chooser, Excel template (same columns as the
// form, locked header, dropdowns), upload review, import, and that imported records match a
// manually added one field for field.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { REPO, appUnderTest, launch, login, trackPage, Results } from './lib/harness.mjs';
import { MockSupabase } from './lib/mock-supabase.mjs';

const OUT = path.join(REPO, 'tests/output/bulk-import'); fs.mkdirSync(OUT, { recursive: true });
const R = new Results('Bulk import');
const mock = new MockSupabase({ data: { users: [], departments: ['HR', 'Production', 'Accounts'], attendance: {}, payroll: {}, nextEmpNum: 2,
  employees: [{ code: 'EMP001', name: 'Asha Test', status: 'Active', department: 'HR', unit: 'Unit-1', basic: 10000, joining: '2022-01-01' }],
  units: [{ code: 'Unit-1', name: 'NORTH WORKS', address: '' }, { code: 'Unit-2', name: '', address: '' }] } });
mock.addAccount('swadmin', 'Str0ngPass!', 'Software Admin');
const app = await appUnderTest(4312);
const browser = await launch();
try {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  const { errors } = trackPage(page);
  await mock.attach(page);
  await login(page, app.url, 'swadmin', 'Str0ngPass!');
  await page.waitForSelector('#app', { state: 'visible' });
  await page.click('.nav-item[data-page="employees"]'); await page.waitForTimeout(150);
  await page.click('text=+ Add Employee'); await page.waitForTimeout(150);
  R.ok('chooser shows Add Manually and Bulk Import', (await page.isVisible('text=Add Manually')) && (await page.isVisible('.addEmpChoice >> text=Bulk Import')));
  await page.click('text=Add Manually'); await page.waitForTimeout(150);
  R.ok('Add Manually opens the form', await page.isVisible('#empForm'));
  const formLabels = await page.$$eval('#empForm label', (ls) => ls.map((l) => l.textContent.trim()));
  await page.click('#empForm >> text=Cancel');
  await page.click('text=+ Add Employee'); await page.click('.addEmpChoice >> text=Bulk Import'); await page.waitForTimeout(200);
  R.ok('bulk dialog opens, legacy modal closed', (await page.isVisible('.bulkImportModal')) && !(await page.$eval('#overlay', (e) => e.classList.contains('show'))));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download Template')]);
  const tpl = path.join(OUT, 'template.xlsx'); await dl.saveAs(tpl);
  R.ok('template file name uses the app name', dl.suggestedFilename() === 'Payroll-Employee-Import-Template.xlsx', dl.suggestedFilename());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(tpl); const ws = wb.getWorksheet('Employees');
  const hdr = []; ws.getRow(1).eachCell((c) => hdr.push(String(c.value)));
  const want = ['S.No', ...formLabels.filter((l) => !/Resignation/.test(l) && !/^Status$/.test(l))];
  R.ok(`Excel columns = form fields, same order (${hdr.length})`, JSON.stringify(hdr.filter((h) => h !== 'Status')) === JSON.stringify(want.filter((h) => h !== 'Status')), `excel ${JSON.stringify(hdr)} form ${JSON.stringify(want)}`);
  R.ok('A1 is S.No and the header row is locked', ws.getCell('A1').value === 'S.No' && ws.getCell('A1').protection?.locked !== false && !!ws.sheetProtection);
  R.ok('creator / instructions carry no company identity', !new RegExp(Buffer.from('dmlwbHx2aXNhbGFt', 'base64').toString(), 'i').test(JSON.stringify(wb.creator) + JSON.stringify(wb.getWorksheet('Instructions')?.getSheetValues())));
  const H = {}; ws.getRow(1).eachCell((c, n) => { H[c.value] = n; }); const put = (r, h, v) => { ws.getRow(r).getCell(H[h]).value = v; };
  put(2, 'Full Name *', 'Arun Sample'); put(2, 'Department', 'Production'); put(2, 'Joining Date', new Date(Date.UTC(2023, 3, 25))); put(2, 'Basic Salary', 15000);
  put(2, 'HRA', 3000); put(2, 'Mobile Number', '9000000001'); put(2, 'Working Unit', 'Unit-1 - NORTH WORKS'); put(2, 'Payment Mode', 'CASH');
  put(3, 'Full Name *', 'Bala Sample'); put(3, 'Department', 'HR'); put(3, 'PF Deduction', 'Nil'); put(3, 'ESI Deduction', 'Exempted'); put(3, 'Working Unit', 'Unit-2');
  put(4, 'Full Name *', 'Chitra Sample'); put(4, 'Department', 'Sales');
  const filled = path.join(OUT, 'filled.xlsx'); await wb.xlsx.writeFile(filled);
  await page.setInputFiles('.bulkImportModal input[type=file]', filled); await page.waitForSelector('.bulkImportTable');
  R.ok('review shows 2 ready, 1 to fix', (await page.isVisible('text=✓ 2 ready')) && (await page.isVisible('text=⚠ 1 need fixing')));
  R.ok('error explains the department', await page.isVisible('text=Department "Sales" is not one of: HR, Production, Accounts'));
  const before = mock.row.employees.length;
  await page.click('text=Import 2 employees'); await page.waitForSelector('.bulkImportDone');
  const [a, b] = mock.row.employees.slice(before);
  R.ok('2 employees saved', mock.row.employees.length === before + 2);
  R.ok('fields mapped (row 1)', a.name === 'Arun Sample' && a.department === 'Production' && a.joining === '2023-04-25' && a.originalJoining === '2023-04-25' && a.basic === 15000
    && a.hra === 3000 && a.mobile === '9000000001' && a.unit === 'Unit-1' && a.mode === 'CASH' && a.status === 'Active' && a.pfApplicable === true && a.esiApplicable === true, JSON.stringify(a));
  R.ok('fields mapped (row 2)', b.status === 'Active' && b.pfDeduction === 'nil' && b.pfApplicable === false && b.esiApplicable === false && b.unit === 'Unit-2', JSON.stringify(b));
  await page.click('text=Done');
  R.ok('employee list shows imported rows', await page.isVisible('text=Arun Sample'));
  await page.evaluate((c) => openEmployeeModal(c), a.code); await page.waitForTimeout(150);
  R.ok('imported employee opens in the Edit form', (await page.inputValue('#f_name')) === 'Arun Sample' && (await page.inputValue('#f_dept')) === 'Production');
  await page.fill('#f_designation', 'Supervisor'); await page.click('#empForm button[type=submit]'); await page.waitForTimeout(300);
  R.ok('edit saved', mock.row.employees.find((e) => e.code === a.code).designation === 'Supervisor');
  await page.click('text=+ Add Employee'); await page.click('text=Add Manually'); await page.fill('#f_name', 'Manual One'); await page.click('#empForm button[type=submit]'); await page.waitForTimeout(300);
  const manual = mock.row.employees.find((e) => e.name === 'Manual One'); const imp = mock.row.employees.find((e) => e.name === 'Bala Sample');
  const km = Object.keys(manual).sort().join(','); const ki = Object.keys(imp).sort().join(',');
  R.ok('imported record has the same fields as a manual one', km === ki, `manual-only ${Object.keys(manual).filter((k) => !(k in imp))} import-only ${Object.keys(imp).filter((k) => !(k in manual))}`);
  R.ok('employee codes continue in sequence', [a.code, b.code, manual.code].join() === 'EMP002,EMP003,EMP004', [a.code, b.code, manual.code].join());
  await page.click('text=+ Add Employee'); await page.click('.addEmpChoice >> text=Bulk Import');
  const bad = path.join(OUT, 'bad.csv'); fs.writeFileSync(bad, 'a,b');
  await page.setInputFiles('.bulkImportModal input[type=file]', bad); await page.waitForTimeout(200);
  R.ok('non-xlsx file rejected', await page.isVisible('text=Please upload an Excel .xlsx file'));
  await page.keyboard.press('Escape');
  R.ok('Escape closes the dialog', !(await page.isVisible('.bulkImportModal')));
  await page.click('.nav-item[data-page="dashboard"]'); await page.waitForTimeout(150);
  await page.click('text=+ Add Employee'); await page.waitForTimeout(150);
  R.ok('dashboard button opens the chooser', await page.isVisible('.addEmpChoices'));
  R.ok('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); app.stop();
}
R.summary();
process.exitCode = R.failed ? 1 : 0;
