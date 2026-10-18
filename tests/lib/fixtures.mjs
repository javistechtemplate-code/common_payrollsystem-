// Deterministic synthetic company used by the regression tests. Every name, number and address
// here is invented. Same seed → same data, so two builds of the app can be compared exactly.

export const MONTHS = ['2026-04', '2026-05'];
export const FIXED_NOW = '2026-05-20T10:00:00+05:30'; // the tests freeze the browser clock here

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

const FIRST = ['Asha', 'Bharat', 'Chandra', 'Deepa', 'Eswar', 'Farida', 'Gopal', 'Hema', 'Imran', 'Janani', 'Karthik', 'Lakshmi',
  'Mohan', 'Nisha', 'Omkar', 'Padma', 'Ravi', 'Saranya', 'Tarun', 'Uma', 'Vijay', 'Wahida', 'Yamuna', 'Zubair'];
const LAST = ['Test', 'Sample', 'Demo', 'Example'];
const DEPTS = ['Accounts', 'HR', 'Admin', 'Production', 'Stores', 'Sales'];
const DESIG = ['Operator', 'Supervisor', 'Clerk', 'Executive', 'Helper', 'Manager'];
const MODES = ['NEFT', 'TRANSFER', 'CASH', 'CHEQUE'];

export function syntheticCompany() {
  const r = rng(20260401);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const units = [1, 2, 3, 4, 5, 6].map((n) => ({ code: `Unit-${n}`, name: n === 2 ? '' : `TEST UNIT ${n}`, address: `${n} Example Street, Testville` }));

  const employees = FIRST.map((first, i) => {
    const n = i + 1;
    const basic = 8000 + Math.round(r() * 22000 / 50) * 50;
    const pfOff = n % 7 === 0, esiOff = n % 5 === 0;
    return {
      code: 'EMP' + String(n).padStart(3, '0'), name: `${first} ${LAST[i % 4]}`, status: 'Active', resignationDate: '', resignReason: '',
      gender: n % 2 ? 'Male' : 'Female', dob: `19${80 + (n % 20)}-0${1 + (n % 9)}-1${n % 10}`, relative: `Parent ${n}`,
      mobile: '90000' + String(10000 + n), email: `emp${n}@example.com`, address: `${n} Sample Road, Testville`,
      joining: `20${15 + (n % 10)}-0${1 + (n % 9)}-0${1 + (n % 9)}`, department: DEPTS[i % DEPTS.length], designation: pick(DESIG),
      empType: n % 9 === 0 ? 'Contract' : 'Full-Time', unit: `Unit-${1 + (i % 6)}`,
      bankName: 'Example Bank', branch: 'Main', accNo: '0000' + String(100000 + n), ifsc: 'EXMP0000001', pan: `ABCDE${String(1000 + n)}F`,
      aadhaar: '0000 0000 ' + String(1000 + n), pfNo: pfOff ? '' : `TN/TEST/${1000 + n}`, esiNo: esiOff ? '' : String(9000000 + n),
      uan: pfOff ? '' : String(100000000000 + n),
      basic, hra: Math.round(basic * 0.2), da: n % 3 ? 0 : 500, special: n % 4 ? 0 : 750, medical: n % 6 ? 0 : 1250,
      conveyance: 800 + (n % 3) * 100, washing: 300 + (n % 2) * 200, other: n % 8 ? 0 : 400,
      mode: MODES[i % MODES.length], pfDeduction: pfOff ? 'nil' : 'yes', pfApplicable: !pfOff, esiApplicable: !esiOff,
      pt: n % 5 ? 0 : 200, rent: n % 10 ? 0 : 1000, otherDed: n % 11 ? 0 : 150, clBalance: n % 4, noplBalance: 6 + (n % 5),
      originalJoining: '', createdAt: '2026-01-01T00:00:00.000Z',
    };
  });
  // One resigned mid-May, one joined mid-April (on roll for one month each way).
  Object.assign(employees[22], { status: 'Resigned', resignationDate: '2026-05-10', resignReason: 'Relocation' });
  employees[23].joining = '2026-04-15';
  employees.forEach((e) => { e.originalJoining = e.joining; });

  const holidays = [{ date: '2026-04-14', type: 'NOPH' }, { date: '2026-05-01', type: 'NOPH' }];
  const attendance = {};
  for (const ym of MONTHS) {
    const [y, m] = ym.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = `${ym}-${String(d).padStart(2, '0')}`;
      if (new Date(y, m - 1, d).getDay() === 0 || holidays.some((h) => h.date === date)) continue;
      attendance[date] = {};
      for (const e of employees) {
        if (date < e.joining || (e.resignationDate && date > e.resignationDate)) continue;
        const x = r();
        if (x < 0.02) continue; // left unmarked
        attendance[date][e.code] = x < 0.82 ? 'Present' : x < 0.88 ? 'HalfDay' : x < 0.94 ? 'PaidLeave' : 'LossOfPay';
      }
    }
  }

  const payrollAdjustments = {};
  for (const ym of MONTHS) {
    payrollAdjustments[ym] = {};
    employees.forEach((e, i) => {
      if (i % 3) return;
      payrollAdjustments[ym][e.code] = { otHours: Math.round(r() * 20), lopOverride: i === 9 ? 2 : null, advance: 0,
        tax: i % 2 ? 0 : 300, otherAllowanceOneOff: i % 4 ? 0 : 600, otherDedOneOff: i % 5 ? 0 : 250,
        lunchTokens: Math.round(r() * 22), dinnerTokens: Math.round(r() * 10) };
    });
  }

  const salaryAdvances = [{ id: 'ADV1000', empCode: 'EMP004', amount: 10000, months: 4, startMonth: '2026-04', monthlyDeduction: 2500,
    remarks: 'Synthetic advance', createdAt: '2026-03-25T00:00:00.000Z',
    schedule: [['2026-04', 7500], ['2026-05', 5000], ['2026-06', 2500], ['2026-07', 0]].map(([month, balance]) => ({ month, amount: 2500, balance })) }];

  const increments = [{ id: 'INC1000', empCode: 'EMP002', empName: employees[1].name, financialYear: '2026-2027', effectiveDate: '2026-04-01',
    prevBasic: employees[1].basic - 1200, prevHra: employees[1].hra - 400, prevConveyance: employees[1].conveyance - 200, prevWashing: employees[1].washing - 200,
    incrementAmount: 2000, incrementBasic: 1200, incrementHra: 400, incrementConveyance: 200, incrementWashing: 200,
    revisedBasic: employees[1].basic, revisedHra: employees[1].hra, revisedConveyance: employees[1].conveyance, revisedWashing: employees[1].washing,
    revisedGross: employees[1].basic + employees[1].hra + employees[1].conveyance + employees[1].washing,
    remarks: 'Synthetic increment', createdAt: '2026-04-01T00:00:00.000Z', createdBy: 'swadmin' }];

  const timeEntries = { '2026-05-04': { EMP001: { inH: 9, inM: 0, inAP: 'AM', outH: 6, outM: 15, outAP: 'PM' }, EMP002: { inH: 8, inM: 45, inAP: 'AM', outH: 5, outM: 30, outAP: 'PM' } } };

  return {
    users: [{ username: 'swadmin', name: 'Test Software Admin', role: 'Software Admin', active: true }],
    departments: DEPTS, employees, attendance, payroll: {}, increments, nextEmpNum: employees.length + 1,
    companyName: 'Test Company Pvt Ltd', companyAddress: '1 Example Park, Testville 600000',
    companyGSTIN: '00TEST0000T0Z0', companyPAN: 'TESTP0000T', companyCIN: '', companyPhone: '0000000000', companyEmail: 'info@example.com', companyLogo: '',
    unit1Name: units[0].name, unit1Address: units[0].address, unit2Name: units[1].name, unit2Address: units[1].address,
    units, unitsVersion: 3,
    autoBackup: { enabled: false, frequency: 'daily', time: '20:00', weekday: 1, dayOfMonth: 1, lastRun: null, nextRun: null },
    backupHistory: [], holidays, timeEntries, timeHolidays: [{ date: '2026-05-01', remarks: 'May Day' }],
    timeLeaves: [{ date: '2026-05-06', empCode: 'EMP003', type: 'NOPL', remarks: '' }], loginLogs: [],
    settings: { nowd: 24, esiRate: 0.0075, esiEmployerRate: 0.0325, pfRate: 0.12, pfEmployerRate: 0.12, canteenLunchRate: 18, canteenDinnerRate: 13.5 },
    payrollAdjustments, salaryAdvances,
  };
}
