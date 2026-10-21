// Deterministic synthetic company used by the regression tests. Every name, number and address
// here is invented. Same seed → same data, so two builds of the app can be compared exactly.
// It exercises the daily-wage payroll: attendance from Employee Time Entry (late and OT minutes),
// marks on the Attendance screen, leaves, holidays, month adjustments, an advance, a mid-month
// wage increment, a wage change from the Employee form, contractors, an inactive and a resigned
// employee.

export const MONTHS = ['2026-04', '2026-05'];
export const FIXED_NOW = '2026-05-31T18:00:00+05:30'; // the tests freeze the browser clock here

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const split = (w) => ({ dailyWage: w, basic: Math.round(w * 0.6 * 100) / 100, hra: Math.round(w * 0.4 * 100) / 100 });
const hm = (min) => ({ h: (Math.floor(min / 60) % 12) || 12, m: min % 60, ap: (min % 1440) >= 720 ? 'PM' : 'AM' });

const FIRST = ['Asha', 'Bharat', 'Chandra', 'Deepa', 'Eswar', 'Farida', 'Gopal', 'Hema', 'Imran', 'Janani', 'Karthik', 'Lakshmi',
  'Mohan', 'Nisha', 'Omkar', 'Padma', 'Ravi', 'Saranya', 'Tarun', 'Uma', 'Vijay', 'Wahida', 'Yamuna', 'Zubair'];
const LAST = ['Test', 'Sample', 'Demo', 'Example'];
const DEPTS = ['Packing', 'Production', 'Quality Assurance', 'Assembly', 'Dispatch', 'Stores'];
const DESIG = ['Operator', 'Supervisor', 'Helper', 'Technician'];
const MODES = ['NEFT', 'TRANSFER', 'CASH', 'CHEQUE'];

export function syntheticCompany() {
  const r = rng(20260401);
  const units = [1, 2, 3, 4, 5, 6].map((n) => ({ code: `Unit-${n}`, name: '', address: `${n} Example Street, Testville` }));
  const contractors = [1, 2, 3].map((n) => ({ code: `C-${n}`, name: `TEST CONTRACTOR ${'ABC'[n - 1]}`, address: '', phone: '' }));

  const employees = FIRST.map((first, i) => {
    const n = i + 1;
    const wage = 450 + Math.round(r() * 500 / 5) * 5;
    const pfOff = n % 7 === 0, esiOff = n % 5 === 0;
    return {
      code: 'EMP' + String(n).padStart(3, '0'), name: `${first} ${LAST[i % 4]}`, status: 'Active', inactiveFrom: '', resignationDate: '', resignReason: '',
      gender: n % 2 ? 'Male' : 'Female', dob: `19${80 + (n % 20)}-0${1 + (n % 9)}-1${n % 10}`, relative: `Parent ${n}`,
      mobile: '90000' + String(10000 + n), email: `emp${n}@example.com`, address: `${n} Sample Road, Testville`,
      joining: `20${15 + (n % 10)}-0${1 + (n % 9)}-0${1 + (n % 9)}`, department: DEPTS[i % DEPTS.length], designation: DESIG[i % DESIG.length],
      empType: n % 9 === 0 ? 'Contract' : 'Full-Time', unit: `Unit-${1 + (i % 6)}`, contractor: n % 4 === 0 ? '' : `C-${1 + (i % 3)}`,
      bankName: 'Example Bank', branch: 'Main', accNo: '0000' + String(100000 + n), ifsc: 'EXMP0000001', pan: `ABCDE${String(1000 + n)}F`,
      aadhaar: '0000 0000 ' + String(1000 + n), pfNo: pfOff ? '' : `TN/TEST/${1000 + n}`, esiNo: esiOff ? '' : String(9000000 + n),
      uan: pfOff ? '' : String(100000000000 + n), ...split(wage),
      mode: MODES[i % MODES.length], pfDeduction: pfOff ? 'nil' : 'yes', pfApplicable: !pfOff, esiApplicable: !esiOff,
      canteenTokens: n % 3 ? 0 : 1 + (n % 4), employmentHistory: [], originalJoining: '', rejoinDate: '', createdAt: '2026-01-01T00:00:00.000Z',
    };
  });
  Object.assign(employees[21], { status: 'Inactive', inactiveFrom: '2026-05-16' });
  Object.assign(employees[22], { status: 'Resigned', resignationDate: '2026-05-10', resignReason: 'Relocation' });
  employees[23].joining = '2026-04-15';
  employees.forEach((e) => { e.originalJoining = e.joining; });
  // Daily wage changed on the Employee form from 20 Apr (prev → current).
  employees[4].wageHistory = [{ from: '2026-04-20', prev: employees[4].dailyWage - 40, wage: employees[4].dailyWage, at: '2026-04-19T10:00:00.000Z' }];

  const holidays = [{ date: '2026-04-14', type: 'NOPH' }, { date: '2026-05-01', type: 'NOPH' }];
  const timeHolidays = [{ date: '2026-05-23', remarks: 'Plant maintenance' }];
  const attendance = {}; const timeEntries = {}; const timeLeaves = [];
  const onRoll = (e, ds) => ds >= e.joining && !(e.resignationDate && ds > e.resignationDate) && !(e.inactiveFrom && ds >= e.inactiveFrom);
  for (const ym of MONTHS) {
    const [y, m] = ym.split('-').map(Number);
    for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
      const ds = `${ym}-${String(d).padStart(2, '0')}`;
      const sunday = new Date(y, m - 1, d).getDay() === 0;
      if (holidays.some((h) => h.date === ds)) continue;
      for (const e of employees) {
        if (!onRoll(e, ds)) continue;
        const x = r();
        if (sunday) { // a few people work on Sundays → whole time is OT
          if (x < 0.08) (timeEntries[ds] ||= {})[e.code] = { inH: 9, inM: 0, inAP: 'AM', outH: 1, outM: 30, outAP: 'PM' };
          continue;
        }
        if (x < 0.03) continue; // nothing entered (not marked)
        if (x < 0.06) { (attendance[ds] ||= {})[e.code] = 'LossOfPay'; continue; }
        if (x < 0.08) { (attendance[ds] ||= {})[e.code] = 'HalfDay'; continue; }
        if (x < 0.10) { timeLeaves.push({ date: ds, empCode: e.code, type: x < 0.09 ? 'Loss of Pay' : 'Half Day', remarks: '' }); if (x < 0.09) continue; }
        const inMin = 8 * 60 + 50 + Math.floor(r() * 35);            // 8:50–9:24 → some late minutes
        const outMin = 17 * 60 + 30 + Math.floor(r() * 4) * 30 + Math.floor(r() * 10); // up to ~2h OT
        const a = hm(inMin), b = hm(outMin);
        (timeEntries[ds] ||= {})[e.code] = { inH: a.h, inM: a.m, inAP: a.ap, outH: b.h, outM: b.m, outAP: b.ap };
      }
    }
  }

  const payrollAdjustments = {};
  for (const ym of MONTHS) {
    payrollAdjustments[ym] = {};
    employees.forEach((e, i) => {
      if (i % 3) return;
      payrollAdjustments[ym][e.code] = { otHours: 0, lopOverride: i === 9 ? 2 : null, advance: 0, tax: i % 2 ? 0 : 300,
        otherAllowanceOneOff: i % 4 ? 0 : 600, otherDedOneOff: i % 5 ? 0 : 250, lunchTokens: 0, dinnerTokens: 0 };
    });
    payrollAdjustments[ym].EMP002 = { ...ADJ0, otTyped: true, otHours: 6.5 };           // OT typed on the Attendance screen
    payrollAdjustments[ym].EMP003 = { ...ADJ0, lateMinutes: 200, canteenTokens: 3 };     // late and canteen typed for the month
  }

  const salaryAdvances = [{ id: 'ADV1000', empCode: 'EMP004', amount: 6000, months: 3, startMonth: '2026-04', monthlyDeduction: 2000,
    remarks: 'Synthetic advance', createdAt: '2026-03-25T00:00:00.000Z',
    schedule: [['2026-04', 4000], ['2026-05', 2000], ['2026-06', 0]].map(([month, balance]) => ({ month, amount: 2000, balance })) }];

  const e2 = employees[1];
  const increments = [{ id: 'INC1000', empCode: e2.code, empName: e2.name, wageUnit: 'day', financialYear: '2026-2027', effectiveDate: '2026-05-12',
    prevBasic: split(e2.dailyWage - 50).basic, prevHra: split(e2.dailyWage - 50).hra, revisedBasic: e2.basic, revisedHra: e2.hra,
    prevDailyWage: e2.dailyWage - 50, revisedDailyWage: e2.dailyWage, incrementAmount: 50,
    remarks: 'Synthetic increment', createdAt: '2026-05-12T00:00:00.000Z', createdBy: 'swadmin' }];

  return {
    users: [{ username: 'swadmin', name: 'Test Software Admin', role: 'Software Admin', active: true }],
    departments: DEPTS, departmentsSeeded: true, designations: DESIG.slice().sort(), employees, attendance, payroll: {}, increments, nextEmpNum: employees.length + 1,
    companyName: 'Testco Industries Pvt Ltd', companyAddress: '1 Example Park, Testville 600000',
    companyGSTIN: '00TEST0000T0Z0', companyPAN: 'TESTP0000T', companyCIN: '', companyPhone: '0000000000', companyEmail: 'info@example.com', companyLogo: '',
    unit1Name: '', unit1Address: units[0].address, unit2Name: '', unit2Address: units[1].address,
    units, unitsVersion: 4, removedUnits: [], contractors, contractorRates: { '2026-04': 30, '2026-05': 32 },
    autoBackup: { enabled: false, frequency: 'daily', time: '20:00', weekday: 1, dayOfMonth: 1, lastRun: null, nextRun: null },
    backupHistory: [], holidays, timeEntries, timeHolidays, timeLeaves, loginLogs: [],
    settings: { nowd: 24, esiRate: 0.0075, esiEmployerRate: 0.0325, pfRate: 0.12, pfEmployerRate: 0.12, canteenLunchRate: 18, canteenDinnerRate: 13.5,
      canteenTokenPrice: 150, lateGraceMinutes: 120 },
    payrollAdjustments, salaryAdvances,
  };
}
const ADJ0 = { otHours: 0, lopOverride: null, advance: 0, tax: 0, otherAllowanceOneOff: 0, otherDedOneOff: 0, lunchTokens: 0, dinnerTokens: 0 };
