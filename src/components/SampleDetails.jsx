import { useMemo, useState } from 'react';
import { Archive, ArrowRightLeft, History, PackageOpen, Pencil, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { moveSamples, takeOutSamples, useBoxSamples, useBoxes, useInventoryMutation, useSampleHistory } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useFormSubmit } from './useFormSubmit.js';
import { NotifyMoveDialog } from './NotifyMove.jsx';
import { boxColorOf, boxDisplay, positionLabel, rowLabel } from '../lib/grid.js';
import { fmtDate, fmtDateTime, yesNo } from '../lib/format.js';
import { Alert, Badge, Button, Field, Modal, Segmented, Select, Spinner, Textarea, cx } from './ui.jsx';

// ------------------------------------------------------------------ details

const FIELDS = [
  ['Grid Name', (s, b) => `${b.name}${positionLabel(s.row_num, s.col_num)}`],
  ['Sample ID', (s) => s.sample_code],
  ['Transfected', (s) => yesNo(s.transfected)],
  ['Transfected With', (s) => s.transfected_with || '—'],
  ['Passage No.', (s) => s.passage_number ?? '—'],
  ['Who Passaged', (s) => s.passaged_by || '—'],
  ['Date of Passage', (s) => fmtDate(s.passage_date)],
  ['Freezing Media', (s) => s.media || '—'],
  ['Researcher Responsible', (s) => s.researcher_responsible || '—'],
  ['Date Frozen', (s) => fmtDate(s.date_frozen)],
  ['Date Added', (s) => fmtDate(s.date_added)],
  ['Cell Line Origin', (s) => s.cell_line_origin || '—'],
  ['Research Project', (s) => s.project || '—'],
  ['Genetic Modifications', (s) => s.genetic_modifications || '—'],
  ['Selection Marker', (s) => s.selection_marker || '—'],
  ['Antibiotic Resistance', (s) => s.antibiotic_resistance || '—'],
];

const ACTION_LABEL = {
  create: ['Added', 'green'], update: ['Edited', 'blue'], move: ['Moved', 'teal'],
  archive: ['Archived', 'amber'], remove: ['Removed', 'red'], restore: ['Restored', 'green'], delete: ['Deleted', 'red'],
};
const IGNORE = new Set(['updated_at', 'updated_by', 'version', 'created_at', 'created_by', 'archived_at', 'archived_by']);
const pretty = (k) => k.replace(/_/g, ' ').replace(/\bnum\b/, '').trim();

function HistoryList({ sampleId, boxesById }) {
  const { data, isLoading, error } = useSampleHistory(sampleId);
  if (isLoading) return <Spinner label="Loading history…" className="py-8" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data?.length) return <p className="text-sm text-slate-500">No history recorded.</p>;
  const loc = (v) => {
    const b = boxesById[v.box_id];
    return `${b ? `${b.tank_name} › Rack ${b.rack_name} › Box ${boxDisplay(b)} · ` : ''}${positionLabel(v.row_num, v.col_num)}`;
  };
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-5">
      {data.map((ev) => {
        const [label, tone] = ACTION_LABEL[ev.action] || [ev.action, 'slate'];
        const changes = ev.action === 'update' && ev.old_values
          ? Object.keys(ev.new_values).filter((k) => !IGNORE.has(k) && JSON.stringify(ev.new_values[k]) !== JSON.stringify(ev.old_values[k]))
          : [];
        return (
          <li key={ev.id} className="ml-5">
            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{label}</Badge>
              <span className="text-xs text-slate-500">{fmtDateTime(ev.occurred_at)} · {ev.actor_email || 'system'}</span>
            </div>
            <div className="mt-1 text-sm text-slate-700">
              {ev.action === 'create' && <>Stored at {loc(ev.new_values)}</>}
              {ev.action === 'move' && <>{loc(ev.old_values)} → {loc(ev.new_values)}</>}
              {['archive', 'remove'].includes(ev.action) && ev.new_values.archive_reason && <>Reason: {ev.new_values.archive_reason}</>}
              {changes.length > 0 && (
                <ul className="space-y-0.5">
                  {changes.map((k) => (
                    <li key={k}>
                      <span className="text-slate-500 capitalize">{pretty(k)}:</span>{' '}
                      <span className="line-through text-slate-400">{String(ev.old_values[k] ?? '—') || '—'}</span>{' '}
                      → {String(ev.new_values[k] ?? '—') || '—'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function SampleDetails({ sample, box, onClose, onEdit, onMove, onRemove, readOnly = false }) {
  const { canEdit: mayEdit } = useAuth();
  const canEdit = mayEdit && !readOnly && sample.status === 'active';
  const [tab, setTab] = useState('details');
  const { data: boxes } = useBoxes();
  const boxesById = useMemo(() => Object.fromEntries((boxes || []).map((b) => [b.id, b])), [boxes]);
  const c = boxColorOf(box);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <span className="h-9 min-w-9 px-2 rounded-lg flex items-center justify-center text-sm font-semibold" style={{ background: c.fill, color: c.text }}>
            {box.name}{positionLabel(sample.row_num, sample.col_num)}
          </span>
          <span className="truncate">{sample.sample_name}</span>
        </span>
      }
      subtitle={`${box.tank_name} › Rack ${box.rack_name} › Box ${boxDisplay(box)} › ${positionLabel(sample.row_num, sample.col_num)}`}
      footer={canEdit && (
        <>
          <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={onRemove}><Trash2 className="h-4 w-4" /> Take out</Button>
          <Button variant="secondary" onClick={onMove}><ArrowRightLeft className="h-4 w-4" /> Move</Button>
          <Button onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
        </>
      )}
    >
      <div className="mb-5">
        <Segmented
          label="View"
          value={tab}
          onChange={setTab}
          options={[{ value: 'details', label: 'Details' }, { value: 'history', label: 'History' }]}
        />
      </div>
      {tab === 'details' ? (
        <>
          {sample.status !== 'active' && (
            <Alert tone="warning" className="mb-4">
              This sample is <strong>{sample.status}</strong>{sample.archived_at ? ` since ${fmtDate(sample.archived_at)}` : ''}
              {sample.archive_reason ? ` — ${sample.archive_reason}` : ''}. It no longer occupies this position.
            </Alert>
          )}
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {FIELDS.map(([label, get]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="text-sm text-slate-900 break-words">{get(sample, box)}</dd>
              </div>
            ))}
          </dl>
          {sample.notes && (
            <div className="mt-4">
              <div className="text-xs font-medium text-slate-500">Notes</div>
              <p className="text-sm text-slate-900 whitespace-pre-wrap">{sample.notes}</p>
            </div>
          )}
          <p className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Last modified {fmtDateTime(sample.updated_at)}
          </p>
        </>
      ) : (
        <HistoryList sampleId={sample.id} boxesById={boxesById} />
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ move

// ------------------------------------------------------------------ move (one or many)

const pkey = (r, c) => `${r}-${c}`;
const gridNameOf = (box, s) => `${box.name}${positionLabel(s.row_num, s.col_num)}`;

/**
 * Move one or several samples to empty squares in any box, side by side:
 * the samples on the left, the destination box's grid on the right.
 * Each click on an empty square places the next sample there.
 */
export function TransferDialog({ samples, fromBox, onClose, onMoved }) {
  const { data: boxes } = useBoxes();
  const [boxId, setBoxId] = useState(fromBox.id);
  const [targets, setTargets] = useState({}); // sampleId -> {row, col}
  const [done, setDone] = useState(null); // moves, once saved
  const { data: occupants, isLoading } = useBoxSamples(boxId);
  const { run, busy, error } = useFormSubmit();
  const move = useInventoryMutation(moveSamples);
  const box = (boxes || []).find((b) => b.id === boxId) || fromBox;
  const color = boxColorOf(box);

  const taken = useMemo(() => new Map((occupants || []).map((s) => [pkey(s.row_num, s.col_num), s])), [occupants]);
  const placedAt = useMemo(() => {
    const m = new Map();
    Object.entries(targets).forEach(([id, t]) => m.set(pkey(t.row, t.col), samples.find((s) => s.id === id)));
    return m;
  }, [targets, samples]);
  const waiting = samples.filter((s) => !targets[s.id]);
  const allPlaced = waiting.length === 0;

  function changeBox(id) { setBoxId(id); setTargets({}); }

  function clickSquare(r, c) {
    const k = pkey(r, c);
    const here = placedAt.get(k);
    if (here) { // un-place
      setTargets((t) => { const n = { ...t }; delete n[here.id]; return n; });
      return;
    }
    if (taken.has(k) || !waiting.length) return;
    setTargets((t) => ({ ...t, [waiting[0].id]: { row: r, col: c } }));
  }

  function autoFill() {
    const next = { ...targets };
    const used = new Set(Object.values(next).map((t) => pkey(t.row, t.col)));
    let i = 0;
    for (let r = 1; r <= box.rows && i < waiting.length; r++) {
      for (let c = 1; c <= box.cols && i < waiting.length; c++) {
        const k = pkey(r, c);
        if (!taken.has(k) && !used.has(k)) { next[waiting[i].id] = { row: r, col: c }; used.add(k); i++; }
      }
    }
    setTargets(next);
  }

  const free = box.rows * box.cols - taken.size;

  function submit() {
    const moves = samples.map((s) => ({ sample: s, boxId, row: targets[s.id].row, col: targets[s.id].col }));
    run(() => move.mutateAsync(moves), {
      onDone: () => setDone(samples.map((s) => ({
        sample: s, fromBox, from: { row: s.row_num, col: s.col_num }, toBox: box, to: targets[s.id],
      }))),
    });
  }

  if (done) return <NotifyMoveDialog moves={done} onClose={onMoved} />;

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="xl"
      title={samples.length === 1 ? `Move ${samples[0].sample_name}` : `Move ${samples.length} samples`}
      subtitle={`From ${fromBox.tank_name} › Rack ${fromBox.rack_name} › Box ${boxDisplay(fromBox)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!allPlaced} loading={busy}>
            <ArrowRightLeft className="h-4 w-4" />
            {allPlaced ? `Move ${samples.length === 1 ? 'sample' : `${samples.length} samples`}` : `Place ${waiting.length} more`}
          </Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Samples to move</div>
          <ol className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {samples.map((s, i) => {
              const t = targets[s.id];
              const isNext = !t && waiting[0]?.id === s.id;
              return (
                <li
                  key={s.id}
                  className={cx(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm',
                    t ? 'border-brand-200 bg-brand-50' : isNext ? 'border-amber-300 bg-amber-50' : 'border-slate-200',
                  )}
                >
                  <span className="text-xs text-slate-400 w-4 text-right">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 truncate">{s.sample_name}</div>
                    <div className="text-xs text-slate-500">
                      {gridNameOf(fromBox, s)} → {t ? <strong className="text-brand-800">{box.name}{positionLabel(t.row, t.col)}</strong> : isNext ? <span className="text-amber-700">click a square</span> : '…'}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-w-0">
          <Field label="Destination box" className="mb-3">
            <Select value={boxId} onChange={(e) => changeBox(e.target.value)}>
              {(boxes || []).filter((b) => b.status === 'active').map((b) => (
                <option key={b.id} value={b.id}>
                  {b.tank_name} › Rack {b.rack_name} › Box {boxDisplay(b)} ({b.total_positions - b.filled_positions} free){b.id === fromBox.id ? ' — same box' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <p className="text-sm text-slate-500 flex-1 min-w-40">
              {allPlaced ? 'All placed. Click a placed square to undo it.' : `Click empty squares in order (${samples.length - waiting.length} of ${samples.length} placed).`}
            </p>
            <Button variant="secondary" size="sm" onClick={autoFill} disabled={allPlaced || free < waiting.length}>
              <Sparkles className="h-4 w-4" /> Fill first empty squares
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setTargets({})} disabled={!Object.keys(targets).length}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
          {free < samples.length && (
            <Alert tone="warning" className="mb-3">This box only has {free} empty square{free === 1 ? '' : 's'}; you are moving {samples.length}.</Alert>
          )}
          {isLoading ? <Spinner className="py-8" /> : (
            <div className="overflow-x-auto pb-1">
              <div className="grid gap-1 w-max" style={{ gridTemplateColumns: `1.5rem repeat(${box.cols}, 2.25rem)` }}>
                <span />
                {Array.from({ length: box.cols }, (_, i) => <span key={i} className="text-center text-[11px] text-slate-400">{i + 1}</span>)}
                {Array.from({ length: box.rows }, (_, ri) => {
                  const r = ri + 1;
                  return [
                    <span key={`l${r}`} className="text-[11px] text-slate-400 flex items-center justify-center">{rowLabel(r)}</span>,
                    ...Array.from({ length: box.cols }, (_, ci) => {
                      const c = ci + 1;
                      const k = pkey(r, c);
                      const occ = taken.get(k);
                      const moving = occ && samples.some((s) => s.id === occ.id);
                      const placed = placedAt.get(k);
                      const order = placed ? samples.indexOf(placed) + 1 : null;
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={Boolean(occ) && !placed}
                          onClick={() => clickSquare(r, c)}
                          title={occ ? `${box.name}${positionLabel(r, c)} · ${occ.sample_name}${moving ? ' (moving)' : ''}` : placed ? `${placed.sample_name} → ${box.name}${positionLabel(r, c)} (click to undo)` : `${box.name}${positionLabel(r, c)}`}
                          aria-label={`${box.name}${positionLabel(r, c)}${occ ? ` occupied by ${occ.sample_name}` : placed ? ` — ${placed.sample_name} goes here` : ' empty'}`}
                          className={cx(
                            'h-9 w-9 rounded-md text-[10px] font-medium transition',
                            placed
                              ? 'bg-brand-700 text-white ring-2 ring-brand-300'
                              : occ
                                ? cx('cursor-not-allowed', moving ? 'opacity-30 ring-2 ring-amber-400' : 'opacity-70')
                                : 'border border-dashed border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50 text-slate-400',
                          )}
                          style={occ && !placed ? { background: color.fill, color: color.text } : undefined}
                        >
                          {placed ? order : positionLabel(r, c)}
                        </button>
                      );
                    }),
                  ];
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Kept for single-sample moves from the details window. */
export function MoveDialog({ sample, fromBox, onClose, onMoved }) {
  return <TransferDialog samples={[sample]} fromBox={fromBox} onClose={onClose} onMoved={onMoved} />;
}

// ------------------------------------------------------------------ take out (one or many)

/**
 * Taking samples out of a box. First asks: move them to another box,
 * or take them out of storage? Taking out keeps the record and history.
 */
export function RemoveDialog({ samples: list, sample, fromBox, onClose, onDone, onMoveInstead }) {
  const samples = list || [sample];
  const many = samples.length > 1;
  const [step, setStep] = useState('choose'); // choose | takeout
  const [status, setStatus] = useState('archived');
  const [reason, setReason] = useState('');
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation(({ st, why }) => takeOutSamples(samples, st, why));
  const names = samples.map((s) => (fromBox ? gridNameOf(fromBox, s) : positionLabel(s.row_num, s.col_num)));

  function submit() {
    run(
      () => save.mutateAsync({ st: status, why: reason.trim() }),
      {
        success: `${many ? `${samples.length} samples` : samples[0].sample_name} ${status === 'archived' ? 'archived' : 'marked as removed'}. ${many ? 'Their positions are' : 'Its position is'} now free.`,
        onDone,
      },
    );
  }

  const summary = (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-2.5 max-h-28 overflow-y-auto">
      <div className="flex flex-wrap gap-1.5">
        {samples.map((s, i) => (
          <span key={s.id} className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs">
            <strong className="text-brand-800">{names[i]}</strong> {s.sample_name}
          </span>
        ))}
      </div>
    </div>
  );

  if (step === 'choose') {
    return (
      <Modal open onClose={onClose} size="md" title={many ? `Take out ${samples.length} samples?` : `Take out ${samples[0].sample_name}?`}
        footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}>
        {summary}
        <p className="text-sm text-slate-600 mb-3">What are you doing with {many ? 'these vials' : 'this vial'}?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {onMoveInstead && (
            <button
              type="button"
              onClick={onMoveInstead}
              className="text-left rounded-xl border-2 border-slate-200 p-4 hover:border-brand-600 hover:bg-brand-50 transition"
            >
              <ArrowRightLeft className="h-5 w-5 text-brand-700 mb-2" />
              <div className="font-medium text-slate-900">Move to another box</div>
              <div className="text-xs text-slate-500 mt-0.5">The vials stay in storage. Pick their new squares on a grid.</div>
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep('takeout')}
            className="text-left rounded-xl border-2 border-slate-200 p-4 hover:border-red-400 hover:bg-red-50 transition"
          >
            <PackageOpen className="h-5 w-5 text-red-500 mb-2" />
            <div className="font-medium text-slate-900">Take out of storage</div>
            <div className="text-xs text-slate-500 mt-0.5">Thawed, used or discarded. The squares become free; the records are kept.</div>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="md"
      title={many ? `Take out ${samples.length} samples` : `Take out ${samples[0].sample_name}`}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setStep('choose')} disabled={busy}>Back</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy}><Archive className="h-4 w-4" /> Confirm</Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {summary}
      <p className="text-sm text-slate-600 mb-4">
        The {many ? 'squares become' : 'square becomes'} free. The {many ? 'records and their' : 'record and its'} full history are kept and can be found in Reports.
      </p>
      <Field label="What happened?" className="mb-4">
        <div>
          <Segmented
            label="Outcome"
            value={status}
            onChange={setStatus}
            options={[{ value: 'archived', label: 'Used / thawed' }, { value: 'removed', label: 'Discarded' }]}
          />
        </div>
      </Field>
      <Field label="Reason / note" hint="e.g. Thawed for experiment 2026-10-21">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
      </Field>
    </Modal>
  );
}
