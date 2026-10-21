import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft, Box, CirclePlus, History, PackageOpen, Pencil, RotateCcw, Trash2, UserCog,
} from 'lucide-react';
import { supabase, unwrap } from '../lib/supabase.js';
import { useBoxes } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { boxDisplay, positionLabel } from '../lib/grid.js';
import { fmtDate } from '../lib/format.js';
import { Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Spinner, cx } from '../components/ui.jsx';

const PAGE = 200;

const FILTERS = [
  { value: 'all', label: 'Everything' },
  { value: 'create', label: 'Added' },
  { value: 'move', label: 'Moved' },
  { value: 'out', label: 'Taken out' },
  { value: 'update', label: 'Edited' },
];

const LABELS = {
  passage_number: 'passage no.', passaged_by: 'who passaged', passage_date: 'date of passage', media: 'freezing media',
  sample_name: 'name', transfected: 'transfected', transfected_with: 'transfected with', researcher_responsible: 'researcher',
  date_frozen: 'date frozen', cell_line_origin: 'origin', genetic_modifications: 'modifications', selection_marker: 'selection marker',
  antibiotic_resistance: 'antibiotic resistance', project: 'project', notes: 'notes', name: 'name', label: 'nickname',
  location: 'location', rack_capacity: 'capacity', box_capacity: 'capacity', rows: 'grid size', cols: 'grid size',
  color: 'color', temperature_c: 'temperature', full_name: 'name', initials: 'initials', role: 'role',
};
const IGNORE = new Set(['updated_at', 'updated_by', 'version', 'created_at', 'created_by', 'archived_at', 'archived_by', 'sample_code', 'id', 'password_set', 'approved_at', 'approved_by']);

function describe(ev, boxesById) {
  const v = ev.new_values || ev.old_values || {};
  const where = (x) => {
    if (!x?.box_id) return '';
    const b = boxesById[x.box_id];
    return b ? `${b.name}${positionLabel(x.row_num, x.col_num)}` : positionLabel(x.row_num, x.col_num);
  };
  const box = (x) => {
    const b = boxesById[x?.box_id];
    return b ? `${b.tank_name} › Rack ${b.rack_name} › Box ${boxDisplay(b)}` : '';
  };
  const changed = ev.old_values && ev.new_values
    ? [...new Set(Object.keys(ev.new_values)
      .filter((k) => !IGNORE.has(k) && JSON.stringify(ev.new_values[k]) !== JSON.stringify(ev.old_values[k]))
      .map((k) => LABELS[k] || k.replace(/_/g, ' ')))]
    : [];
  const name = ev.entity_label || '';

  if (ev.entity_type === 'sample') {
    switch (ev.action) {
      case 'create': return { icon: CirclePlus, tone: 'text-emerald-600 bg-emerald-50', text: <>Added <b>{name}</b> at <b>{where(v)}</b></>, sub: box(v) };
      case 'move': return { icon: ArrowRightLeft, tone: 'text-brand-700 bg-brand-50', text: <>Moved <b>{name}</b> from <b>{where(ev.old_values)}</b> to <b>{where(ev.new_values)}</b></>, sub: box(ev.new_values) };
      case 'archive': return { icon: PackageOpen, tone: 'text-amber-700 bg-amber-50', text: <>Took out <b>{name}</b> from <b>{where(v)}</b> (used / thawed)</>, sub: v.archive_reason || box(v) };
      case 'remove': return { icon: Trash2, tone: 'text-red-600 bg-red-50', text: <>Took out <b>{name}</b> from <b>{where(v)}</b> (discarded)</>, sub: v.archive_reason || box(v) };
      case 'restore': return { icon: RotateCcw, tone: 'text-emerald-600 bg-emerald-50', text: <>Put <b>{name}</b> back at <b>{where(v)}</b></>, sub: box(v) };
      case 'delete': return { icon: Trash2, tone: 'text-red-600 bg-red-50', text: <>Deleted the record for <b>{name}</b></>, sub: '' };
      default: return { icon: Pencil, tone: 'text-blue-600 bg-blue-50', text: <>Edited <b>{name}</b> at <b>{where(v)}</b>{changed.length ? <>: {changed.join(', ')}</> : null}</>, sub: box(v) };
    }
  }
  const kind = { tank: 'tank', rack: 'rack', box: 'box', profile: 'account' }[ev.entity_type] || ev.entity_type;
  const verb = { create: 'Added', update: 'Edited', archive: 'Archived', restore: 'Restored', delete: 'Deleted', remove: 'Removed', move: 'Moved' }[ev.action] || 'Changed';
  return {
    icon: ev.entity_type === 'profile' ? UserCog : Box,
    tone: 'text-slate-600 bg-slate-100',
    text: <>{verb} {kind} <b>{name}</b>{changed.length && ev.action === 'update' ? <>: {changed.join(', ')}</> : null}</>,
    sub: '',
  };
}

export default function ActivityPage() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [who, setWho] = useState('me');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const { data: boxes } = useBoxes();
  const boxesById = useMemo(() => Object.fromEntries((boxes || []).map((b) => [b.id, b])), [boxes]);

  const q = useQuery({
    queryKey: ['history', 'activity', who, filter, limit, profile.id],
    queryFn: async () => {
      let query = supabase.from('audit_log').select('*').order('occurred_at', { ascending: false }).limit(limit + 1);
      if (who === 'me') query = query.eq('actor_id', profile.id);
      if (filter === 'out') query = query.in('action', ['archive', 'remove']).eq('entity_type', 'sample');
      else if (filter !== 'all') query = query.eq('action', filter).eq('entity_type', 'sample');
      return unwrap(await query);
    },
  });
  const rows = (q.data || []).slice(0, limit);
  const more = (q.data || []).length > limit;

  const days = useMemo(() => {
    const m = new Map();
    rows.forEach((ev) => {
      const d = new Date(ev.occurred_at);
      const k = d.toDateString();
      if (!m.has(k)) m.set(k, { date: d, items: [] });
      m.get(k).items.push(ev);
    });
    return [...m.values()];
  }, [rows]);

  const dayLabel = (d) => {
    const today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  function open(ev) {
    const v = ev.new_values || ev.old_values;
    if (ev.entity_type === 'sample' && v?.box_id && !['archive', 'remove', 'delete'].includes(ev.action)) {
      navigate(`/grid/${v.box_id}?pos=${positionLabel(v.row_num, v.col_num)}`);
    }
  }

  return (
    <>
      <PageHeader
        title={who === 'me' ? 'My Activity' : 'Lab Activity'}
        subtitle={who === 'me' ? 'Everything you have added, moved, edited or taken out' : 'What everyone in the lab has done'}
        actions={isAdmin && (
          <Segmented label="Whose activity" value={who} onChange={(v) => { setWho(v); setLimit(PAGE); }} options={[{ value: 'me', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} />
        )}
      />
      <div className="mb-5 overflow-x-auto">
        <Segmented label="Show" value={filter} onChange={(v) => { setFilter(v); setLimit(PAGE); }} options={FILTERS} />
      </div>

      {q.isLoading ? <Spinner /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : rows.length === 0 ? (
        <EmptyState icon={History} title="Nothing here yet">
          {who === 'me' ? 'When you add, move, edit or take out vials, it will be listed here.' : 'No activity matches.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day.date.toDateString()}>
              <h2 className="text-sm font-semibold text-slate-500 mb-2">{dayLabel(day.date)}</h2>
              <Card className="divide-y divide-slate-100">
                {day.items.map((ev) => {
                  const d = describe(ev, boxesById);
                  const Icon = d.icon;
                  const clickable = ev.entity_type === 'sample' && !['archive', 'remove', 'delete'].includes(ev.action);
                  return (
                    <div
                      key={ev.id}
                      onClick={() => open(ev)}
                      className={cx('flex items-start gap-3 px-4 py-3', clickable && 'cursor-pointer hover:bg-slate-50')}
                    >
                      <span className={cx('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', d.tone)}><Icon className="h-4 w-4" /></span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 [&_b]:font-semibold [&_b]:text-slate-900">{d.text}</div>
                        {d.sub && <div className="text-xs text-slate-500 mt-0.5 truncate">{d.sub}</div>}
                      </div>
                      <div className="text-xs text-slate-400 text-right shrink-0">
                        {new Date(ev.occurred_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        {who === 'all' && <div className="text-slate-500">{ev.actor_email || 'system'}</div>}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
          {more && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>Show older activity</Button>
            </div>
          )}
          <p className="text-xs text-slate-400 text-center">Showing activity since {fmtDate(rows[rows.length - 1]?.occurred_at)}</p>
        </div>
      )}
    </>
  );
}
