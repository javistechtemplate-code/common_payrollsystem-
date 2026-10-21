// Employee Bulk Import (Software Admin → Bulk Import): Excel template with the same columns as the
// Add Employee form (locked header, dropdowns, daily-wage formulas), upload review, import, and
// that imported records match a manually added one field for field.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { REPO, appUnderTest, launch, login, trackPage, Results } from './lib/harness.mjs';
import { MockSupabase } from './lib/mock-supabase.mjs';

const OUT = path.join(REPO, 'tests/output/bulk-import'); fs.mkdirSync(OUT, { recursive: true });
const R = new Results('Bulk import');
const mock = new MockSupabase({ data: { users: [], companyName: 'Sampleco Works', departments: ['Packing', 'Production', 'Stores'], departmentsSeeded: true,
  designations: ['Helper', 'Operator'], attendance: {}, payroll: {}, nextEmpNum: 2,
  employees: [{ code: 'EMP001', name: 'Asha Test', status: 'Active', department: 'Packing', designation: 'Helper', unit: 'Unit-1', contractor: '', dailyWage: 500, basic: 300, hra: 200, joining: '2022-01-01' }],
  units: [{ code: 'Unit-1', name: '', address: '' }, { code: 'Unit-2', name: '', address: '' }],
  contractors: [{ code: 'C-1', name: 'SAMPLE CONTRACTOR', address: '', phone: '' }] } });
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
  await page.click('#pageBody >> text=Add Employee'); await page.waitForTimeout(150);
  R.ok('+ Add Employee opens the form', await page.isVisible('#empForm'));
  const formLabels = await page.$$eval('#empForm label', (ls) => ls.map((l) => l.textContent.trim()));
  await page.click('#empForm >> text=Cancel');

  await page.click('.nav-item[data-page="softwareadmin"]'); await page.waitForTimeout(150);
  await page.click('text=Bulk Import (Excel)'); await page.waitForTimeout(200);
  R.ok('bulk dialog opens from Software Admin', await page.isVisible('.bulkImportModal'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download Template')]);
  const tpl = path.join(OUT, 'template.xlsx'); await dl.saveAs(tpl);
  R.ok('template file name uses the company name', dl.suggestedFilename() === 'Sampleco-Works-Employee-Import-Template.xlsx', dl.suggestedFilename());
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(tpl); const ws = wb.getWorksheet('Employees');
  const hdr = []; ws.getRow(1).eachCell((c) => hdr.push(String(c.value).replace(/ \(DD-MM-YYYY\)$/, '')));
  const inForm = hdr.slice(1).map((h) => formLabels.indexOf(h));
  R.ok(`Excel columns are form fields, in form order (${hdr.length - 1})`, hdr[0] === 'S.No' && inForm.every((i, k) => i >= 0 && (k === 0 || i > inForm[k - 1])), `excel ${JSON.stringify(hdr)} form ${JSON.stringify(formLabels)}`);
  const notInSheet = formLabels.filter((l) => !hdr.includes(l));
  R.ok('form fields left out of the sheet are only status/resignation/PF/ESI', notInSheet.every((l) => /Inactive|Resignation|PF Deduction|ESI Deduction/.test(l)), JSON.stringify(notInSheet));
  R.ok('A1 is S.No and the header row is locked', ws.getCell('A1').value === 'S.No' && ws.getCell('A1').protection?.locked !== false && !!ws.sheetProtection);
  const ident = new RegExp(Buffer.from('dmlwbHx2aXNhbGFt', 'base64').toString(), 'i');
  R.ok('creator / instructions carry no original company identity', !ident.test(JSON.stringify(wb.creator) + JSON.stringify(wb.getWorksheet('Instructions')?.getSheetValues())));
  const H = {}; ws.getRow(1).eachCell((c, n) => { H[String(c.value).replace(/ \(DD-MM-YYYY\)$/, '')] = n; });
  const put = (r, h, v) => { ws.getRow(r).getCell(H[h]).value = v; };
  put(2, 'Full Name *', 'Arun Sample'); put(2, 'Department', 'Production'); put(2, 'Designation', 'Operator'); put(2, 'Joining Date', new Date(Date.UTC(2023, 3, 25)));
  put(2, 'Daily Wage — TOTAL (₹ per day)', 640); put(2, 'Mobile Number', '9000000001'); put(2, 'Working Unit', 'Sampleco Unit-2'); put(2, 'Contractor', 'SAMPLE CONTRACTOR'); put(2, 'Payment Mode', 'CASH');
  put(3, 'Full Name *', 'Bala Sample'); put(3, 'Department', 'Packing'); put(3, 'Contractor', 'Non Contractor'); put(3, 'Canteen Tokens (per month)', 4);
  put(4, 'Full Name *', 'Chitra Sample'); put(4, 'Department', 'Sales');
  const filled = path.join(OUT, 'filled.xlsx'); await wb.xlsx.writeFile(filled);
  await page.setInputFiles('.bulkImportModal input[type=file]', filled); await page.waitForSelector('.bulkImportTable');
  R.ok('review shows 2 ready, 1 to fix', (await page.textContent('.bulkChip.ok')).trim() === '2 ready' && (await page.textContent('.bulkChip.bad')).trim() === '1 need fixing');
  R.ok('error explains the department', await page.isVisible('text=Department "Sales" is not one of'));
  const before = mock.row.employees.length;
  await page.click('text=Import 2 employees'); await page.waitForSelector('.bulkImportDone');
  const [a, b] = mock.row.employees.slice(before);
  R.ok('2 employees saved', mock.row.employees.length === before + 2);
  R.ok('fields mapped (row 1, daily wage split 60/40)', a.name === 'Arun Sample' && a.department === 'Production' && a.designation === 'Operator' && a.joining === '2023-04-25'
    && a.dailyWage === 640 && a.basic === 384 && a.hra === 256 && a.mobile === '9000000001' && a.unit === 'Unit-2' && a.contractor === 'C-1' && a.mode === 'CASH'
    && a.status === 'Active' && a.pfApplicable === true && a.esiApplicable === true, JSON.stringify(a));
  R.ok('fields mapped (row 2)', b.status === 'Active' && b.contractor === '' && b.canteenTokens === 4 && b.department === 'Packing', JSON.stringify(b));
  await page.click('text=Done');
  await page.click('.nav-item[data-page="employees"]'); await page.waitForTimeout(150);
  R.ok('employee list shows imported rows', await page.isVisible('text=Arun Sample'));
  await page.evaluate((c) => openEmployeeModal(c), a.code); await page.waitForTimeout(150);
  R.ok('imported employee opens in the Edit form', (await page.inputValue('#f_name')) === 'Arun Sample' && (await page.inputValue('#f_dept')) === 'Production');
  await page.click('#empForm >> text=Cancel');
  await page.click('#pageBody >> text=Add Employee'); await page.fill('#f_name', 'Manual One'); await page.click('#empForm button[type=submit]'); await page.waitForTimeout(400);
  const manual = mock.row.employees.find((e) => e.name === 'Manual One'); const imp = mock.row.employees.find((e) => e.name === 'Bala Sample');
  // The form also starts an employee's (empty) wage / increment history; import leaves them unset.
  const keys = (o) => Object.keys(o || {}).filter((k) => !['wageHistory', 'incrementHistory'].includes(k)).sort().join(',');
  const km = keys(manual); const ki = keys(imp);
  R.ok('imported record has the same fields as a manual one (history lists aside)', !!manual && km === ki, manual ? `manual-only ${Object.keys(manual).filter((k) => !(k in imp))} import-only ${Object.keys(imp).filter((k) => !(k in manual))}` : 'manual employee not saved');
  R.ok('employee codes continue in sequence', [a.code, b.code, manual?.code].join() === 'EMP002,EMP003,EMP004', [a.code, b.code, manual?.code].join());
  await page.click('.nav-item[data-page="softwareadmin"]'); await page.waitForTimeout(150);
  await page.click('text=Bulk Import (Excel)');
  const bad = path.join(OUT, 'bad.csv'); fs.writeFileSync(bad, 'a,b');
  await page.setInputFiles('.bulkImportModal input[type=file]', bad); await page.waitForTimeout(200);
  R.ok('non-xlsx file rejected', await page.isVisible('text=Please upload an Excel .xlsx file'));
  await page.keyboard.press('Escape');
  R.ok('Escape closes the dialog', !(await page.isVisible('.bulkImportModal')));
  R.ok('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); app.stop();
}
R.summary();
process.exitCode = R.failed ? 1 : 0;
