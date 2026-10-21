// Working units: always shown with their number and the company's short name in front
// ("Testco Unit-3") in the employee list, form, attendance and time-entry unit tabs, pay slips,
// acquittance register, Software Admin (add / delete) and the Excel template / import.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { REPO, appUnderTest, launch, login, trackPage, capturePrintWindows, Results } from './lib/harness.mjs';
import { MockSupabase } from './lib/mock-supabase.mjs';

const OUT = path.join(REPO, 'tests/output/units'); fs.mkdirSync(OUT, { recursive: true });
const R = new Results('Working units');
const L = [1, 2, 3, 4, 5, 6].map((n) => `Testco Unit-${n}`);
const mk = (code, name, unit) => ({ code, name, status: 'Active', department: 'Packing', designation: 'Operator', unit, contractor: '', dailyWage: 500, basic: 300, hra: 200,
  mode: 'NEFT', pfDeduction: 'yes', pfApplicable: true, esiApplicable: true, joining: '2020-01-01', createdAt: 'x' });
// Saved data with only four units (as an older install would have) — the rest are added.
const mock = new MockSupabase({ data: { users: [], companyName: 'Testco Industries Pvt Ltd', departments: ['Packing'], departmentsSeeded: true, designations: ['Operator'],
  attendance: {}, payroll: {}, nextEmpNum: 6, contractors: [],
  units: [{ code: 'Unit-1', name: '', address: 'North addr' }, { code: 'Unit-2', name: '', address: '' }, { code: 'Unit-3', name: '', address: '' }, { code: 'Unit-4', name: '', address: '' }],
  employees: [mk('E001', 'Ann North', 'Unit-1'), mk('E002', 'Bob Two', 'Unit-2'), mk('E003', 'Cat Three', 'Unit-3'), mk('E004', 'Dan Four', 'Unit-4'), mk('E005', 'Eve Blank', '')] } });
mock.addAccount('swadmin', 'Str0ngPass!', 'Software Admin');
const app = await appUnderTest(4313);
const browser = await launch();
try {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  const { errors } = trackPage(page);
  await mock.attach(page);
  await capturePrintWindows(page);
  await login(page, app.url, 'swadmin', 'Str0ngPass!');
  await page.waitForSelector('#app', { state: 'visible' });
  R.ok('saved data completed to 6 units, address kept',
    JSON.stringify(mock.row.units.map((u) => u.code)) === JSON.stringify(['Unit-1', 'Unit-2', 'Unit-3', 'Unit-4', 'Unit-5', 'Unit-6']) && mock.row.units[0].address === 'North addr', JSON.stringify(mock.row.units));
  await page.click('.nav-item[data-page="employees"]'); await page.waitForTimeout(150);
  const body = await page.innerText('#pageBody');
  R.ok('employee list shows "Testco Unit-N"', ['Testco Unit-1', 'Testco Unit-2', 'Testco Unit-3', 'Testco Unit-4'].every((n) => body.includes(n)));
  await page.click('#pageBody >> text=Add Employee'); await page.waitForTimeout(150);
  const formOpts = (await page.$$eval('#f_unit option', (o) => o.map((x) => x.textContent))).filter((x) => x.startsWith('Testco'));
  R.ok('form Working Unit dropdown', JSON.stringify(formOpts) === JSON.stringify(L), JSON.stringify(formOpts));
  await page.fill('#f_name', 'New Six'); await page.selectOption('#f_unit', 'Unit-6'); await page.click('#empForm button[type=submit]'); await page.waitForTimeout(400);
  R.ok('form saves Unit-6', mock.row.employees.find((e) => e.name === 'New Six')?.unit === 'Unit-6');
  await page.click('.nav-item[data-page="attendance"]'); await page.waitForTimeout(200);
  const attTabs = await page.$$eval('.attUnitTab', (b) => b.map((x) => x.textContent.trim()));
  R.ok('attendance unit tabs', JSON.stringify(attTabs.slice(1)) === JSON.stringify(L.map((x) => x.replace(/-/g, ' ').toUpperCase())), JSON.stringify(attTabs));
  await page.click('.nav-item[data-page="payroll"]'); await page.waitForTimeout(150);
  await page.evaluate(() => generatePayroll()); await page.waitForTimeout(300);
  await page.evaluate(() => printAllSlips('Unit-3', '', payMonth)); await page.waitForTimeout(300);
  const pr = await page.evaluate(() => window.__printed.at(-1) || '');
  R.ok('slips for one unit show "Testco Unit-3", only that unit', pr.includes('Testco Unit-3') && pr.includes('Cat Three') && !pr.includes('Ann North'));
  const acq = await page.evaluate(() => acquittanceUnits(payMonth, 'All').map((u) => `${u.unitName}:${u.rows.map((r) => r.code).join(',')}`));
  R.ok('acquittance register sections (blank unit counts as Unit-1)', JSON.stringify(acq) === JSON.stringify(['Testco Unit-1:E001,E005', 'Testco Unit-2:E002', 'Testco Unit-3:E003', 'Testco Unit-4:E004', 'Testco Unit-6:EMP006']), JSON.stringify(acq));
  await page.click('.nav-item[data-page="softwareadmin"]'); await page.waitForTimeout(200);
  R.ok('Software Admin lists 6 units', (await page.$$('[id^="s_unitAddress_"]')).length === 6);
  await page.fill('#s_unitAddress_Unit-5', 'Five addr'); await page.evaluate(() => saveCompanySettings()); await page.waitForTimeout(300);
  R.ok('a unit address is saved', mock.row.units[4].address === 'Five addr');
  await page.evaluate(() => addWorkingUnit()); await page.waitForTimeout(300);
  R.ok('+ Add Unit creates Unit-7', mock.row.units.at(-1).code === 'Unit-7');
  await page.evaluate(() => deleteWorkingUnit('Unit-5')); await page.waitForTimeout(300);
  R.ok('an empty unit can be deleted and stays deleted', !mock.row.units.some((u) => u.code === 'Unit-5') && mock.row.removedUnits.includes('Unit-5')
    && await page.evaluate(() => { ensureUnits(); return !db.units.some((u) => u.code === 'Unit-5'); }));
  await page.evaluate(() => deleteWorkingUnit('Unit-1')); await page.waitForTimeout(200);
  R.ok('a unit with employees cannot be deleted', mock.row.units.some((u) => u.code === 'Unit-1'));
  await page.click('text=Bulk Import (Excel)'); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download Template')]);
  const tpl = path.join(OUT, 'template.xlsx'); await dl.saveAs(tpl);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(tpl); const ws = wb.getWorksheet('Employees');
  const H = {}; ws.getRow(1).eachCell((c, n) => { H[c.value] = n; });
  const letter = ws.getColumn(H['Working Unit']).letter;
  // Inline list; each value carries a zero-width space so dragging copies instead of counting up.
  const lv = String(ws.dataValidations.model[`${letter}2`]?.formulae?.[0] || '').replace(/^"|"$/g, '').replace(/\u200b/g, '').split(',');
  const want = ['Testco Unit-1', 'Testco Unit-2', 'Testco Unit-3', 'Testco Unit-4', 'Testco Unit-6', 'Testco Unit-7'];
  R.ok('Excel Working Unit dropdown lists the current units', want.every((x) => lv.includes(x)) && !lv.includes('Testco Unit-5'), JSON.stringify(lv.filter((x) => /Unit/.test(x))));
  const put = (r, h, v) => { ws.getRow(r).getCell(H[h]).value = v; };
  put(2, 'Full Name *', 'Xl Three'); put(2, 'Working Unit', 'Testco Unit-3');
  put(3, 'Full Name *', 'Xl Seven'); put(3, 'Working Unit', 'Testco Unit-7');
  const filled = path.join(OUT, 'filled.xlsx'); await wb.xlsx.writeFile(filled);
  await page.setInputFiles('.bulkImportModal input[type=file]', filled); await page.waitForSelector('.bulkImportTable');
  await page.click('text=Import 2 employees'); await page.waitForSelector('.bulkImportDone');
  R.ok('Excel import maps units', mock.row.employees.find((e) => e.name === 'Xl Three')?.unit === 'Unit-3' && mock.row.employees.find((e) => e.name === 'Xl Seven')?.unit === 'Unit-7');
  R.ok('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); app.stop();
}
R.summary();
process.exitCode = R.failed ? 1 : 0;
