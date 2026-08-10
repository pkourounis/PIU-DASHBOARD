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
const { daily } = buildTechDaily({ estimates: [], appointments, assignments, jobs, invoices }, {}, jobTech);

const rev = {};
for (const byTech of Object.values(daily)) for (const [id, row] of Object.entries(byTech)) rev[id] = (rev[id] || 0) + row[7];

// Job 100 ($1000) split between A & B → $500 each. Job 200 ($400) solo to B.
assert.equal(rev['A'], 500, `Alice gets her HALF of the shared job (got ${rev['A']})`);
assert.equal(rev['B'], 900, `Bob gets his half of the shared job + his solo job (got ${rev['B']})`);   // 500 + 400
// The invariant that makes the location total correct: per-tech revenue sums to the job total.
const total = Object.values(rev).reduce((a, b) => a + b, 0);
assert.equal(total, 1400, `per-tech revenue sums to the completed-job total 1000+400 (got ${total})`);
assert.ok(!('null' in rev), 'no completed revenue leaked to Unassigned when techs are assigned');

console.log('✓ tech-attribution OK — shared-job completed revenue is split across techs and sums to the total');
process.exit(0);
