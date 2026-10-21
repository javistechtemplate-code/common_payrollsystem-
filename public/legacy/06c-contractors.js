/* ================= CONTRACTORS =================
   Contractors supply employees; units are the places they work. The two lists are separate
   and independent — any contractor can provide employees to any unit, and the number of
   contractors and units need not match. db.contractors = [{code, name, address, phone}];
   employee.contractor stores the code ('C-1', …) so renaming a contractor in Software Admin
   changes it everywhere. A new company starts with no contractors; they are added in
   Software Admin. */
// Makes sure db.contractors exists (an empty list for a new company).
function ensureContractors(){
  db.contractors=Array.isArray(db.contractors) ? db.contractors.filter(c=>c && c.code) : [];
}
function getContractors(){ return Array.isArray(db.contractors) ? db.contractors : []; }
// Contractor name for a code (or an employee); '' when none is set.
function contractorName(c){
  const code = c && typeof c==='object' ? c.contractor : c;
  const hit=getContractors().find(x=>x.code===code);
  return hit ? String(hit.name||hit.code) : '';
}
// Does employee e match a contractor filter? '' = all, '-' = no contractor, else a contractor code.
function contractorFilterMatches(e, filter){
  if(!filter) return true;
  return (e && e.contractor || '') === (filter==='-' ? '' : filter);
}
// <option>s for a contractor filter <select>: All Contractors, each contractor, and "Non Contractor"
// (employees the company employs directly — no contractor).
function contractorFilterOptionsHtml(selected){
  return `<option value="" ${!selected?'selected':''}>All Contractors</option>`
    + getContractors().map(c=>`<option value="${c.code}" ${selected===c.code?'selected':''}>${c.name||c.code}</option>`).join('')
    + `<option value="-" ${selected==='-'?'selected':''}>Non Contractor</option>`;
}
// How many employees (any status — active, inactive or resigned) a contractor has supplied.
function contractorEmployeeCount(code){
  return (db.employees||[]).filter(e=>e.contractor===code).length;
}
