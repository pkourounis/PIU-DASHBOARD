// Regression: ServiceTitan SPLITS a shared completed job's revenue across the techs who ran it
// ("adjusted by technician split"), so the per-tech revenues sum exactly to the location's
// Completed Revenue. Earlier bugs credited only the earliest-assigned tech (co-techs showed $0),
// then over-corrected by crediting each tech the FULL amount (totals overshot). This guards the
// equal-split rule and the sum-equals-total invariant.
import assert from 'node:assert';
import { buildTechDaily, buildJobTechMap } from '../src/provider.js';

// Job 100: shared by Alice (assigned first) + Bob. Job 200: Bob solo.
const assignments = [
  { appointmentId: 1, jobId: 100, technicianId: 'A', technicianName: 'Alice', assignedOn: '2026-08-01T10:00:00Z' },
  { appointmentId: 2, jobId: 100, technicianId: 'B', technicianName: 'Bob',   assignedOn: '2026-08-01T11:00:00Z' },
  { appointmentId: 3, jobId: 200, technicianId: 'B', technicianName: 'Bob',   assignedOn: '2026-08-03T09:00:00Z' },
];
const appointments = [
  { id: 1, jobId: 100, start: '2026-08-02T14:00:00Z', end: '2026-08-02T16:00:00Z' },
  { id: 2, jobId: 100, start: '2026-08-02T14:00:00Z', end: '2026-08-02T16:00:00Z' },
  { id: 3, jobId: 200, start: '2026-08-04T14:00:00Z', end: '2026-08-04T15:00:00Z' },
];
const jobs = [
  { id: 100, jobStatus: 'Completed', completedOn: '2026-08-02T16:30:00Z', invoiceId: 500, noCharge: false },
  { id: 200, jobStatus: 'Completed', completedOn: '2026-08-04T15:30:00Z', invoiceId: 501, noCharge: false },
];
const invoices = [ { id: 500, subTotal: 1000 }, { id: 501, subTotal: 400 } ];

const { jobTech } = buildJobTechMap(assignments);

// (1) No split rows → fall back to an equal split across the assigned techs.
const eq = {};
for (const bt of Object.values(buildTechDaily({ estimates: [], appointments, assignments, jobs, invoices }, {}, jobTech).daily))
  for (const [id, row] of Object.entries(bt)) eq[id] = (eq[id] || 0) + row[7];
assert.equal(eq['A'], 500, `fallback: Alice gets half the shared job (got ${eq['A']})`);
assert.equal(eq['B'], 900, `fallback: Bob gets half the shared job + his solo job (got ${eq['B']})`);   // 500 + 400

// (2) With ServiceTitan job splits, revenue follows the real split percentages, not head count.
const splits = [
  { jobId: 100, technicianId: 'A', split: 75 },
  { jobId: 100, technicianId: 'B', split: 25 },
];
const rev = {};
for (const bt of Object.values(buildTechDaily({ estimates: [], appointments, assignments, jobs, invoices, splits }, {}, jobTech).daily))
  for (const [id, row] of Object.entries(bt)) rev[id] = (rev[id] || 0) + row[7];
assert.equal(rev['A'], 750, `split: Alice gets 75% of the shared job (got ${rev['A']})`);           // 1000 * .75
assert.equal(rev['B'], 650, `split: Bob gets 25% of shared + his solo job (got ${rev['B']})`);      // 250 + 400
// The invariant that keeps the location total exact: per-tech revenue sums to the completed-job total.
const total = Object.values(rev).reduce((a, b) => a + b, 0);
assert.equal(total, 1400, `per-tech revenue sums to the completed-job total 1000+400 (got ${total})`);
assert.ok(!('null' in rev), 'no completed revenue leaked to Unassigned when techs are assigned');

console.log('✓ tech-attribution OK — completed revenue uses ServiceTitan job splits (equal-split fallback) and sums to the total');
process.exit(0);
