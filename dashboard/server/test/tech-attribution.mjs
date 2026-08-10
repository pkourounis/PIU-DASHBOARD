// Regression: a completed job worked by two technicians must credit EACH of them the full
// completed (invoice) revenue — not just the earliest-assigned one. Before the fix, co-techs on
// shared jobs showed $0 (their revenue was absorbed by whoever was assigned first).
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

assert.equal(rev['A'], 1000, `Alice gets the full shared-job revenue (got ${rev['A']})`);
assert.equal(rev['B'], 1400, `Bob gets his shared-job credit too, not $0 (got ${rev['B']})`);   // 1000 shared + 400 solo
assert.ok(!('null' in rev), 'no completed revenue leaked to Unassigned when techs are assigned');

console.log('✓ tech-attribution OK — shared-job completed revenue credits each assigned tech fully');
process.exit(0);
