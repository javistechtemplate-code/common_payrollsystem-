// Working units: always shown with their number ("Unit-3 - NAME", or "Unit-2" while unnamed) in
// the employee list, form, attendance filter, pay slips, payroll report, acquittance register,
// Software Admin and the Excel template / import.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { REPO, appUnderTest, launch, login, trackPage, capturePrintWindows, Results } from './lib/harness.mjs';
import { MockSupabase } from './lib/mock-supabase.mjs';

const OUT = path.join(REPO, 'tests/output/units'); fs.mkdirSync(OUT, { recursive: true });
const R = new Results('Working units');
const L = ['Unit-1 - NORTH WORKS', 'Unit-2', 'Unit-3 - EAST PLANT', 'Unit-4 - SOUTH YARD', 'Unit-5', 'Unit-6'];
const mk = (code, name, unit) => ({ code, name, status: 'Active', department: 'HR', designation: 'Op', unit, basic: 10000, hra: 0, da: 0, special: 0, medical: 0, conveyance: 0,
  washing: 0, other: 0, mode: 'NEFT', pfDeduction: 'yes', pfApplicable: true, esiApplicable: true, joining: '2020-01-01', createdAt: 'x' });
// Saved data with only four units (as an older install would have) — the rest are added blank.
const mock = new MockSupabase({ data: { users: [], departments: ['HR', 'Production'], attendance: {}, payroll: {}, nextEmpNum: 6,
  unit1Name: 'NORTH WORKS', unit2Name: '',
  units: [{ code: 'Unit-1', name: 'NORTH WORKS', address: 'North addr' }, { code: 'Unit-2', name: '', address: '' },
    { code: 'Unit-3', name: 'EAST PLANT', address: '' }, { code: 'Unit-4', name: 'SOUTH YARD', address: '' }],
  employees: [mk('E001', 'Ann North', 'Unit-1'), mk('E002', 'Bob Two', 'Unit-2'), mk('E003', 'Cat East', 'Unit-3'), mk('E004', 'Dan South', 'Unit-4'), mk('E005', 'Eve Blank', '')] } });
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
  R.ok('saved data completed to 6 units, new ones unnamed, address kept',
    JSON.stringify(mock.row.units.map((u) => `${u.code}=${u.name}`)) === '["Unit-1=NORTH WORKS","Unit-2=","Unit-3=EAST PLANT","Unit-4=SOUTH YARD","Unit-5=","Unit-6="]' && mock.row.units[0].address === 'North addr', JSON.stringify(mock.row.units));
  await page.click('.nav-item[data-page="employees"]'); await page.waitForTimeout(150);
  const body = await page.innerText('#pageBody');
  R.ok('employee list shows unit with number', ['Unit-1 - NORTH WORKS', 'Unit-3 - EAST PLANT', 'Unit-4 - SOUTH YARD'].every((n) => body.includes(n)) && /Bob Two[\s\S]*Unit-2/.test(body));
  await page.click('text=+ Add Employee'); await page.click('text=Add Manually'); await page.waitForTimeout(150);
  const formOpts = await page.$$eval('#f_unit option', (o) => o.map((x) => x.textContent));
  R.ok('form Working Unit dropdown', JSON.stringify(formOpts) === JSON.stringify(L), JSON.stringify(formOpts));
  await page.fill('#f_name', 'New Six'); await page.selectOption('#f_unit', 'Unit-6'); await page.click('#empForm button[type=submit]'); await page.waitForTimeout(300);
  R.ok('form saves Unit-6', mock.row.employees.find((e) => e.name === 'New Six')?.unit === 'Unit-6');
  await page.click('.nav-item[data-page="attendance"]'); await page.waitForTimeout(200);
  const attOpts = await page.evaluate(() => [...new DOMParser().parseFromString(`<select>${attUnitOptionsHTML()}</select>`, 'text/html').querySelectorAll('option')].map((o) => o.textContent.trim()));
  R.ok('attendance unit filter', JSON.stringify(attOpts.filter((x) => x.startsWith('Unit'))) === JSON.stringify(L), JSON.stringify(attOpts));
  await page.click('.nav-item[data-page="payroll"]'); await page.waitForTimeout(150);
  await page.evaluate(() => generatePayroll()); await page.waitForTimeout(300);
  const btns = await page.$$eval('#pageBody button', (b) => b.filter((x) => x.textContent.includes('Pay Slip')).map((x) => x.textContent.trim()));
  R.ok('payroll: one pay-slip button per unit', btns.length === 6 && btns[5].includes('Unit 6'), JSON.stringify(btns));
  await page.click('text=Employee Pay Slip Unit 3'); await page.waitForTimeout(300);
  let pr = await page.evaluate(() => window.__printed.at(-1) || '');
  R.ok('slips show "Unit-3 - EAST PLANT", only that unit', pr.includes('Unit-3 - EAST PLANT') && pr.includes('Cat East') && !pr.includes('Ann North'));
  await page.evaluate(() => printPayrollReport()); await page.waitForTimeout(300);
  pr = await page.evaluate(() => window.__printed.at(-1) || '');
  R.ok('payroll report sections carry unit numbers', ['Unit-1 - NORTH WORKS — North addr', 'Unit-3 - EAST PLANT', 'Unit-4 - SOUTH YARD'].every((n) => pr.includes(n)));
  const acq = await page.evaluate(() => acquittanceUnits(payMonth, 'All').map((u) => `${u.unitName}:${u.rows.map((r) => r.code).join(',')}`));
  R.ok('acquittance register sections', JSON.stringify(acq) === '["Unit-1 - NORTH WORKS:E001,E005","Unit-2:E002","Unit-3 - EAST PLANT:E003","Unit-4 - SOUTH YARD:E004","Unit-6:EMP006"]', JSON.stringify(acq));
  await page.click('.nav-item[data-page="reports"]'); await page.waitForTimeout(150);
  await page.evaluate(() => openReport('acquittance')); await page.waitForTimeout(200);
  const acqOpts = await page.$$eval('#pageBody select option', (o) => o.map((x) => x.textContent.trim()));
  R.ok('acquittance unit picker', L.every((n) => acqOpts.includes(n)), JSON.stringify(acqOpts));
  await page.click('.nav-item[data-page="softwareadmin"]'); await page.waitForTimeout(200);
  R.ok('Software Admin lists 6 units, unnamed ones empty', (await page.$$('[id^="s_unitName_"]')).length === 6 && (await page.inputValue('#s_unitName_1')) === '');
  await page.fill('#s_unitName_4', 'NEW FIVE'); await page.evaluate(() => saveCompanySettings()); await page.waitForTimeout(300);
  R.ok('a name added later is saved', mock.row.units[4].name === 'NEW FIVE' && mock.row.units[1].name === '');
  await page.evaluate(() => addWorkingUnit()); await page.waitForTimeout(300);
  R.ok('+ Add Unit creates Unit-7', mock.row.units.at(-1).code === 'Unit-7' && mock.row.units.at(-1).name === '');
  await page.click('.nav-item[data-page="employees"]'); await page.waitForTimeout(150);
  await page.click('text=+ Add Employee'); await page.click('.addEmpChoice >> text=Bulk Import'); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download Template')]);
  const tpl = path.join(OUT, 'template.xlsx'); await dl.saveAs(tpl);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(tpl); const ws = wb.getWorksheet('Employees');
  const H = {}; ws.getRow(1).eachCell((c, n) => { H[c.value] = n; });
  const letter = ws.getColumn(H['Working Unit']).letter;
  const dv = Object.entries(ws.dataValidations.model).find(([k]) => k.split(/[: ]/).some((x) => x === `${letter}2`));
  const want = '"Unit-1 - NORTH WORKS,Unit-2,Unit-3 - EAST PLANT,Unit-4 - SOUTH YARD,Unit-5 - NEW FIVE,Unit-6,Unit-7"';
  R.ok('Excel Working Unit dropdown', dv && dv[1].formulae[0] === want, dv && dv[1].formulae[0]);
  const put = (r, h, v) => { ws.getRow(r).getCell(H[h]).value = v; };
  put(2, 'Full Name *', 'Xl East'); put(2, 'Working Unit', 'Unit-3 - EAST PLANT');
  put(3, 'Full Name *', 'Xl Two'); put(3, 'Working Unit', 'Unit-2');
  const filled = path.join(OUT, 'filled.xlsx'); await wb.xlsx.writeFile(filled);
  await page.setInputFiles('.bulkImportModal input[type=file]', filled); await page.waitForSelector('.bulkImportTable');
  await page.click('text=Import 2 employees'); await page.waitForSelector('.bulkImportDone');
  R.ok('Excel import maps units', mock.row.employees.find((e) => e.name === 'Xl East')?.unit === 'Unit-3' && mock.row.employees.find((e) => e.name === 'Xl Two')?.unit === 'Unit-2');
  R.ok('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); app.stop();
}
R.summary();
process.exitCode = R.failed ? 1 : 0;
