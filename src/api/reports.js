// Report definitions. Each returns sheets of { name, table }, where a table
// is { columns, rows }. The first sheet is what the CSV download contains.
import { fetchAll } from './data.js';
import { positionLabel } from '../lib/grid.js';
import { fmtDateTime, yesNo } from '../lib/format.js';

export const SAMPLE_COLUMNS = [
  { key: 'sample_code', label: 'Sample ID' },
  { key: 'sample_name', label: 'Sample' },
  { key: 'tank_name', label: 'Tank' },
  { key: 'rack_name', label: 'Rack' },
  { key: 'box_name', label: 'Box' },
  { key: 'box_label', label: 'Box Nickname' },
  { key: 'position', label: 'Position' },
  { key: 'grid_name', label: 'Grid Name' },
  { key: 'transfected', label: 'Transfected', value: (r) => yesNo(r.transfected) },
  { key: 'transfected_with', label: 'Transfected With' },
  { key: 'passage_number', label: 'Passage No.' },
  { key: 'passaged_by', label: 'Who Passaged' },
  { key: 'passage_date', label: 'Date of Passage' },
  { key: 'media', label: 'Freezing Media' },
  { key: 'researcher_responsible', label: 'Researcher Responsible' },
  { key: 'date_frozen', label: 'Date Frozen' },
  { key: 'date_added', label: 'Date Added' },
  { key: 'cell_line_origin', label: 'Cell Line Origin' },
  { key: 'genetic_modifications', label: 'Genetic Modifications' },
  { key: 'selection_marker', label: 'Selection Marker' },
  { key: 'antibiotic_resistance', label: 'Antibiotic Resistance' },
  { key: 'project', label: 'Project' },
  { key: 'notes', label: 'Notes' },
  { key: 'status', label: 'Status' },
  { key: 'updated_at', label: 'Last Modified', value: (r) => fmtDateTime(r.updated_at) },
];

const activeSamples = () =>
  fetchAll('sample_locations', (q) => q.eq('status', 'active').order('tank_name').order('rack_name').order('box_name').order('row_num').order('col_num'));

function summarise(rows, keyFn, label) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r) || '(not recorded)';
    const e = m.get(k) || { key: k, samples: 0 };
    e.samples += 1;
    m.set(k, e);
  });
  return {
    columns: [{ key: 'key', label }, { key: 'samples', label: 'Samples (vials)' }],
    rows: [...m.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))),
  };
}

const byGroup = (groupLabel, keyFn) => async () => {
  const rows = await activeSamples();
  return [
    { name: 'Samples', table: { columns: SAMPLE_COLUMNS, rows } },
    { name: `Summary by ${groupLabel}`, table: summarise(rows, keyFn, groupLabel) },
  ];
};

export const REPORTS = [
  {
    id: 'tank', title: 'Inventory by tank', description: 'Every stored sample, grouped by tank, with a per-tank summary.',
    build: byGroup('tank', (r) => r.tank_name),
  },
  {
    id: 'rack', title: 'Inventory by rack', description: 'Every stored sample with a per-rack summary.',
    build: byGroup('rack', (r) => `${r.tank_name} › ${r.rack_name}`),
  },
  {
    id: 'box', title: 'Inventory by box', description: 'Every stored sample with a per-box summary.',
    build: byGroup('box', (r) => `${r.tank_name} › ${r.rack_name} › ${r.box_name}`),
  },
  {
    id: 'researcher', title: 'Inventory by researcher', description: 'Samples grouped by the researcher responsible.',
    build: async () => {
      const rows = (await activeSamples()).sort((a, b) =>
        (a.researcher_responsible || '~').localeCompare(b.researcher_responsible || '~'));
      return [
        { name: 'Samples', table: { columns: SAMPLE_COLUMNS, rows } },
        { name: 'Summary by researcher', table: summarise(rows, (r) => r.researcher_responsible, 'Researcher') },
      ];
    },
  },
  {
    id: 'available', title: 'Available storage', description: 'Free positions in every active box, with exact empty slots.',
    build: async () => {
      const [boxes, samples] = await Promise.all([
        fetchAll('box_summary', (q) => q.eq('status', 'active').order('tank_name').order('rack_name').order('name')),
        fetchAll('samples', (q) => q.eq('status', 'active'), 'box_id,row_num,col_num'),
      ]);
      const taken = new Set(samples.map((s) => `${s.box_id}-${s.row_num}-${s.col_num}`));
      const rows = boxes.map((b) => {
        const free = [];
        for (let r = 1; r <= b.rows; r++) for (let c = 1; c <= b.cols; c++) {
          if (!taken.has(`${b.id}-${r}-${c}`)) free.push(positionLabel(r, c));
        }
        return {
          tank: b.tank_name, rack: b.rack_name, box: b.name, grid: `${b.rows} × ${b.cols}`,
          total: b.total_positions, occupied: b.filled_positions, available: b.total_positions - b.filled_positions,
          utilization: b.total_positions ? Number(((b.filled_positions / b.total_positions) * 100).toFixed(1)) : 0,
          free: free.join(' '),
        };
      });
      return [{
        name: 'Available storage',
        table: {
          columns: [
            { key: 'tank', label: 'Tank' }, { key: 'rack', label: 'Rack' }, { key: 'box', label: 'Box' },
            { key: 'grid', label: 'Grid' }, { key: 'total', label: 'Total positions' },
            { key: 'occupied', label: 'Occupied' }, { key: 'available', label: 'Available' },
            { key: 'utilization', label: 'Utilization %' }, { key: 'free', label: 'Empty positions' },
          ],
          rows,
        },
      }];
    },
  },
  {
    id: 'movements', title: 'Sample movement history', description: 'Every time a sample was moved, by whom and when.',
    build: async () => {
      const [events, boxes] = await Promise.all([
        fetchAll('audit_log', (q) => q.eq('entity_type', 'sample').eq('action', 'move').order('occurred_at', { ascending: false })),
        fetchAll('box_summary'),
      ]);
      const bx = Object.fromEntries(boxes.map((b) => [b.id, b]));
      const where = (v) => {
        const b = bx[v.box_id];
        return `${b ? `${b.tank_name} › Rack ${b.rack_name} › Box ${b.name} · ` : ''}${positionLabel(v.row_num, v.col_num)}`;
      };
      return [{
        name: 'Movements',
        table: {
          columns: [
            { key: 'when', label: 'Date & time' }, { key: 'who', label: 'Moved by' },
            { key: 'id', label: 'Sample ID' }, { key: 'sample', label: 'Sample' },
            { key: 'from', label: 'From' }, { key: 'to', label: 'To' },
          ],
          rows: events.map((e) => ({
            when: fmtDateTime(e.occurred_at), who: e.actor_email || '', id: e.new_values.sample_code,
            sample: e.entity_label, from: where(e.old_values), to: where(e.new_values),
          })),
        },
      }];
    },
  },
  {
    id: 'recent', title: 'Recently added samples', description: 'Samples added to inventory in the last 30 days.',
    build: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const rows = await fetchAll('sample_locations', (q) => q.gte('created_at', since).order('created_at', { ascending: false }));
      return [{ name: 'Recently added', table: { columns: [{ key: 'created_at', label: 'Added', value: (r) => fmtDateTime(r.created_at) }, ...SAMPLE_COLUMNS], rows } }];
    },
  },
  {
    id: 'archived', title: 'Archived / removed samples', description: 'Samples taken out of storage, with when and why.',
    build: async () => {
      const rows = await fetchAll('sample_locations', (q) => q.neq('status', 'active').order('archived_at', { ascending: false }));
      return [{
        name: 'Archived & removed',
        table: {
          columns: [
            { key: 'archived_at', label: 'Taken out', value: (r) => fmtDateTime(r.archived_at) },
            { key: 'archive_reason', label: 'Reason' },
            { key: 'last_location', label: 'Last location', value: (r) => `${r.tank_name} › ${r.rack_name} › ${r.box_name} › ${r.position}` },
            ...SAMPLE_COLUMNS.filter((c) => !['tank_name', 'rack_name', 'box_name', 'position'].includes(c.key)),
          ],
          rows,
        },
      }];
    },
  },
];

/** Full export of every table, for backups and moving the data elsewhere. */
export async function buildFullExport({ includeAdmin }) {
  const [tanks, racks, boxes, samples] = await Promise.all([
    fetchAll('tanks', (q) => q.order('created_at')),
    fetchAll('racks', (q) => q.order('created_at')),
    fetchAll('boxes', (q) => q.order('created_at')),
    fetchAll('sample_locations', (q) => q.order('created_at')),
  ]);
  const [audit, profiles] = includeAdmin
    ? await Promise.all([fetchAll('audit_log', (q) => q.order('id')), fetchAll('profiles', (q) => q.order('created_at'))])
    : [[], []];

  const raw = (rows, omit = []) => {
    const keys = rows.length ? Object.keys(rows[0]).filter((k) => !omit.includes(k)) : ['(empty)'];
    return {
      columns: keys.map((k) => ({
        key: k, label: k,
        value: (r) => (r[k] !== null && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]),
      })),
      rows,
    };
  };
  const sheets = [
    { name: 'samples', table: raw(samples) },
    { name: 'boxes', table: raw(boxes) },
    { name: 'racks', table: raw(racks) },
    { name: 'tanks', table: raw(tanks) },
  ];
  if (includeAdmin) {
    sheets.push({ name: 'audit_log', table: raw(audit) });
    sheets.push({ name: 'users', table: raw(profiles) });
  }
  const json = {
    exported_at: new Date().toISOString(),
    format: 'cryomanager-export-v1',
    tanks, racks, boxes, samples, ...(includeAdmin ? { audit_log: audit, profiles } : {}),
  };
  return { sheets, json };
}

