import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, ChevronRight, Grid3x3, Lightbulb, ListChecks, MousePointerClick, PackageOpen, Plus, Printer, X } from 'lucide-react';
import { moveSample, useBoxSamples, useBoxes, useInventoryMutation } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import SampleForm from '../components/SampleForm.jsx';
import { RemoveDialog, SampleDetails, TransferDialog } from '../components/SampleDetails.jsx';
import { useToast } from '../components/Toast.jsx';
import { NotifyMoveDialog } from '../components/NotifyMove.jsx';
import { friendlyError } from '../lib/errors.js';
import { boxColorOf, boxDisplay, fmtPct, parsePosition, pct, positionLabel, rowLabel } from '../lib/grid.js';
import { fmtDate, yesNo } from '../lib/format.js';
import { Button, Card, EmptyState, ErrorState, ProgressBar, Select, Spinner, cx } from '../components/ui.jsx';

const key = (r, c) => `${r}-${c}`;

// ------------------------------------------------------------------ tips

const TIPS_KEY = 'cryomanager.gridTips.hidden';
function readHidden() {
  try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; }
}

function Tips({ canEdit }) {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = (v) => {
    setHidden(v);
    try { localStorage.setItem(TIPS_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  if (hidden) {
    return (
      <button onClick={() => toggle(false)} className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
        <Lightbulb className="h-4 w-4" /> Show tips
      </button>
    );
  }
  const tips = canEdit
    ? [
      ['Add one sample', 'click any empty (dashed) square.'],
      ['Add the same sample to several squares', 'click Fill several squares, pick the squares (or a row letter for a whole row), then Fill.'],
      ['Move within this box', 'drag a sample onto an empty square.'],
      ['Move or take out several samples', 'click Select samples, pick them, then Move to another box or Take out.'],
      ['See details', 'hover over a sample; click it to view, edit, move or take it out.'],
      ['Grid names', 'are box + position, e.g. A1B4 = box A1, row B, column 4.'],
    ]
    : [
      ['See details', 'hover over a sample, or click it for everything including its history.'],
      ['Grid names', 'are box + position, e.g. A1B4 = box A1, row B, column 4.'],
      ['Find something fast', 'use Reports → Find a sample.'],
    ];
  return (
    <div className="no-print mb-5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-brand-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-brand-900 mb-1">Helpful tips</div>
          <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2 text-sm text-slate-700">
            {tips.map(([b, t]) => (
              <li key={b}><span className="font-medium text-slate-900">{b}:</span> {t}</li>
            ))}
          </ul>
        </div>
        <button onClick={() => toggle(true)} aria-label="Hide tips" title="Hide tips" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tooltip

function Tooltip({ hover, boxName }) {
  if (!hover) return null;
  const { sample: s, rect } = hover;
  const top = rect.bottom + 8;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 135), window.innerWidth - 278);
  return (
    <div className="fixed z-40 w-[270px] pointer-events-none rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-sm" style={{ top, left }} role="tooltip">
      <div className="font-semibold text-slate-900 truncate">{s.sample_name}</div>
      <div className="text-xs text-slate-500 mb-2">{boxName}{positionLabel(s.row_num, s.col_num)}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-slate-500">Transfected</dt>
        <dd className="truncate">{yesNo(s.transfected)}{s.transfected && s.transfected_with ? ` — ${s.transfected_with}` : ''}</dd>
        <dt className="text-slate-500">Passage No.</dt><dd>{s.passage_number ?? '—'}</dd>
        <dt className="text-slate-500">Who Passaged</dt><dd className="truncate font-semibold">{s.passaged_by || '—'}</dd>
        <dt className="text-slate-500">Date</dt><dd>{fmtDate(s.passage_date)}</dd>
        <dt className="text-slate-500">Freezing Media</dt><dd className="truncate">{s.media || '—'}</dd>
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------ grid

function BoxGrid({ box, samples, canEdit, highlight, selecting, selected, picked, onToggle, onToggleRow, onPick, onEmpty, onSample, onDropMove }) {
  const [hover, setHover] = useState(null);
  const [dragging, setDragging] = useState(null); // sample being dragged
  const [over, setOver] = useState(null); // cell key under the dragged sample
  const gridRef = useRef(null);
  const color = boxColorOf(box);
  const byPos = useMemo(() => new Map(samples.map((s) => [key(s.row_num, s.col_num), s])), [samples]);

  useEffect(() => {
    if (!highlight) return;
    const el = gridRef.current?.querySelector(`[data-pos="${key(highlight.row, highlight.col)}"]`);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, [highlight, samples]);

  // Arrow-key navigation between cells
  function onKeyDown(e) {
    const m = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!m) return;
    const [r, c] = (e.target.dataset.pos || '').split('-').map(Number);
    if (!r) return;
    const next = gridRef.current.querySelector(`[data-pos="${key(r + m[0], c + m[1])}"]`);
    if (next) { e.preventDefault(); next.focus(); }
  }

  const canDrag = canEdit && !selecting;
  const cell = box.cols > 12 ? 'minmax(2.5rem,3.25rem)' : 'minmax(2.9rem,3.9rem)';
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2" onScroll={() => setHover(null)}>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Box ${box.name} grid, ${box.rows} rows by ${box.cols} columns`}
        aria-multiselectable={Boolean(selecting) || undefined}
        onKeyDown={onKeyDown}
        className="grid gap-1.5 w-max mx-auto"
        style={{ gridTemplateColumns: `1.75rem repeat(${box.cols}, ${cell})` }}
      >
        <span />
        {Array.from({ length: box.cols }, (_, i) => (
          <span key={i} className="text-center text-xs font-medium text-slate-400 pb-1">{i + 1}</span>
        ))}
        {Array.from({ length: box.rows }, (_, ri) => {
          const r = ri + 1;
          return (
            <div key={r} role="row" className="contents">
              {selecting ? (
                <button
                  onClick={() => onToggleRow(r)}
                  title={selecting === 'samples' ? `Select all samples in row ${rowLabel(r)}` : `Select empty squares in row ${rowLabel(r)}`}
                  className="flex items-center justify-center rounded-md text-xs font-semibold text-brand-700 hover:bg-brand-50"
                >
                  {rowLabel(r)}
                </button>
              ) : (
                <span className="flex items-center justify-center text-xs font-medium text-slate-400">{rowLabel(r)}</span>
              )}
              {Array.from({ length: box.cols }, (_, ci) => {
                const c = ci + 1;
                const k = key(r, c);
                const s = byPos.get(k);
                const pos = positionLabel(r, c);
                const gridName = `${box.name}${pos}`;
                const isHi = highlight?.row === r && highlight?.col === c;

                if (s) {
                  const isDragged = dragging?.id === s.id;
                  const isPicked = picked.has(s.id);
                  return (
                    <button
                      key={c}
                      role="gridcell"
                      data-pos={k}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', s.id);
                        setHover(null);
                        setDragging(s);
                      }}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      aria-selected={selecting === 'samples' ? isPicked : undefined}
                      onClick={() => (selecting === 'samples' ? onPick(s) : !selecting && onSample(s))}
                      onMouseEnter={(e) => !dragging && setHover({ sample: s, rect: e.currentTarget.getBoundingClientRect() })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => setHover({ sample: s, rect: e.currentTarget.getBoundingClientRect() })}
                      onBlur={() => setHover(null)}
                      aria-label={`${gridName}: ${s.sample_name}`}
                      className={cx(
                        'relative aspect-square rounded-lg border-2 px-0.5 flex flex-col items-center justify-center overflow-hidden transition-all duration-150',
                        selecting === 'empty' ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-px hover:shadow-md',
                        selecting === 'samples' && !isPicked && 'opacity-60',
                        isPicked && 'ring-4 ring-brand-700 ring-offset-2 opacity-100',
                        canDrag && 'cursor-grab active:cursor-grabbing',
                        isDragged && 'opacity-40 scale-95',
                        isHi && 'ring-4 ring-amber-400 ring-offset-1',
                      )}
                      style={{ background: color.fill, borderColor: color.fill, color: color.text }}
                    >
                      <span className="text-[9px] leading-none opacity-80">{pos}</span>
                      <span className="mt-0.5 text-[10px] font-semibold leading-tight text-center line-clamp-2 break-words">{s.sample_name}</span>
                      {s.passaged_by && <span className="text-[8px] leading-none opacity-80 mt-0.5">{s.passaged_by}</span>}
                      {isPicked && (
                        <span className="absolute top-0.5 right-0.5 rounded-full bg-white text-brand-800 text-[9px] font-bold h-3.5 w-3.5 flex items-center justify-center leading-none">✓</span>
                      )}
                    </button>
                  );
                }

                const isSel = selected.has(k);
                const isOver = over === k;
                return (
                  <button
                    key={c}
                    role="gridcell"
                    data-pos={k}
                    aria-selected={selecting === 'empty' ? isSel : undefined}
                    disabled={!canEdit}
                    onClick={(e) => {
                      if (selecting === 'samples') return;
                      if (selecting === 'empty' || e.shiftKey) onToggle(r, c);
                      else onEmpty(r, c);
                    }}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (over !== k) setOver(k);
                    }}
                    onDragLeave={() => over === k && setOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const s2 = dragging;
                      setDragging(null);
                      setOver(null);
                      if (s2) onDropMove(s2, r, c);
                    }}
                    aria-label={`${gridName}: empty${canEdit ? (selecting === 'empty' ? (isSel ? ', selected' : ', click to select') : selecting ? '' : ', add sample') : ''}`}
                    title={canEdit ? (selecting === 'empty' ? `Select ${gridName}` : selecting ? gridName : `Add sample at ${gridName}`) : `${gridName} (empty)`}
                    className={cx(
                      'group aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-150',
                      isSel
                        ? 'border-solid border-brand-700 bg-brand-100'
                        : isOver
                          ? 'border-solid border-brand-600 bg-brand-100 scale-105'
                          : 'border-dashed border-slate-200 bg-slate-50/60',
                      canEdit && !isSel && 'hover:border-brand-500 hover:bg-brand-50',
                      !canEdit && 'cursor-default',
                      isHi && 'ring-4 ring-amber-400 ring-offset-1',
                    )}
                  >
                    <span className={cx('text-[9px] leading-none', isSel ? 'text-brand-800 font-semibold' : 'text-slate-300 group-hover:text-brand-700')}>{pos}</span>
                    {isSel
                      ? <span className="text-sm leading-none text-brand-800 mt-0.5">✓</span>
                      : canEdit && <Plus className="h-3.5 w-3.5 mt-0.5 text-slate-300 group-hover:text-brand-700" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <Tooltip hover={hover} boxName={box.name} />
    </div>
  );
}

// ------------------------------------------------------------------ page

export default function GridViewPage() {
  const { boxId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { canEdit } = useAuth();
  const boxesQ = useBoxes();
  const activeBoxes = useMemo(() => (boxesQ.data || []).filter((b) => b.status === 'active'), [boxesQ.data]);
  const box = (boxesQ.data || []).find((b) => b.id === boxId);
  const samplesQ = useBoxSamples(box?.id);
  const [dialog, setDialog] = useState(null); // {type, ...}
  const [selecting, setSelecting] = useState(null); // null | 'empty' | 'samples'
  const [selected, setSelected] = useState(() => new Set()); // empty square keys
  const [picked, setPicked] = useState(() => new Set()); // sample ids
  const highlight = useMemo(() => parsePosition(params.get('pos')), [params]);
  const move = useInventoryMutation(moveSample);

  useEffect(() => {
    if (!boxId && activeBoxes.length) navigate(`/grid/${activeBoxes[0].id}`, { replace: true });
  }, [boxId, activeBoxes, navigate]);

  // Leaving a box clears any selection.
  useEffect(() => { setSelecting(null); setSelected(new Set()); setPicked(new Set()); }, [boxId]);

  // Drop selections that someone else has since filled.
  const samples = useMemo(() => samplesQ.data || [], [samplesQ.data]);
  useEffect(() => {
    const taken = new Set(samples.map((s) => key(s.row_num, s.col_num)));
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => !taken.has(k)));
      return next.size === prev.size ? prev : next;
    });
    const ids = new Set(samples.map((s) => s.id));
    setPicked((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [samples]);

  // Keep an open sample dialog in sync with live data (e.g. after an edit elsewhere)
  const liveSample = dialog?.sample && samples.find((s) => s.id === dialog.sample.id);
  useEffect(() => {
    if (dialog?.sample && samplesQ.data && !liveSample && dialog.type === 'details') setDialog(null);
  }, [dialog, liveSample, samplesQ.data]);

  if (boxesQ.isLoading) return <Spinner />;
  if (boxesQ.error) return <ErrorState error={boxesQ.error} onRetry={boxesQ.refetch} />;
  if (!activeBoxes.length) {
    return <EmptyState icon={Grid3x3} title="No boxes to show">Create a tank, a rack and a box first. The box will then appear here as an interactive grid.</EmptyState>;
  }
  if (boxId && !box) {
    return <EmptyState icon={Grid3x3} title="Box not found" action={<Button onClick={() => navigate('/grid')}>Go to first box</Button>}>It may have been deleted, or the link is wrong.</EmptyState>;
  }
  if (!box) return <Spinner />;

  const filled = samples.length;
  const total = box.rows * box.cols;
  const color = boxColorOf(box);
  const close = () => setDialog(null);
  const occupied = new Set(samples.map((s) => key(s.row_num, s.col_num)));

  const toggle = (r, c) => {
    if (occupied.has(key(r, c))) return;
    setSelecting('empty');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key(r, c))) next.delete(key(r, c)); else next.add(key(r, c));
      return next;
    });
  };
  const pick = (s) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
    return next;
  });
  const toggleRow = (r) => {
    if (selecting === 'samples') {
      const inRow = samples.filter((s) => s.row_num === r).map((s) => s.id);
      setPicked((prev) => {
        const next = new Set(prev);
        const all = inRow.every((id) => next.has(id));
        inRow.forEach((id) => (all ? next.delete(id) : next.add(id)));
        return next;
      });
      return;
    }
    const empties = Array.from({ length: box.cols }, (_, i) => key(r, i + 1)).filter((k) => !occupied.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      const all = empties.every((k) => next.has(k));
      empties.forEach((k) => (all ? next.delete(k) : next.add(k)));
      return next;
    });
  };
  const stopSelecting = () => { setSelecting(null); setSelected(new Set()); setPicked(new Set()); };
  const pickedSamples = samples
    .filter((s) => picked.has(s.id))
    .sort((a, b) => a.row_num - b.row_num || a.col_num - b.col_num);
  const selectedPositions = [...selected]
    .map((k) => { const [row, col] = k.split('-').map(Number); return { row, col }; })
    .sort((a, b) => a.row - b.row || a.col - b.col);

  async function dropMove(sample, row, col) {
    if (sample.row_num === row && sample.col_num === col) return;
    const from = `${box.name}${positionLabel(sample.row_num, sample.col_num)}`;
    const to = `${box.name}${positionLabel(row, col)}`;
    try {
      await move.mutateAsync({ sample, boxId: box.id, row, col });
      const moves = [{ sample, fromBox: box, from: { row: sample.row_num, col: sample.col_num }, toBox: box, to: { row, col } }];
      toast.success(`${sample.sample_name} moved from ${from} to ${to}.`, {
        label: 'Email someone about this',
        onClick: () => setDialog({ type: 'notify', moves }),
      });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-5">
        <div>
          <nav aria-label="Location" className="flex items-center flex-wrap gap-1 text-2xl font-semibold tracking-tight text-slate-900">
            <span>{box.tank_name}</span>
            <ChevronRight className="h-5 w-5 text-slate-300" />
            <span>{box.rack_name}</span>
            <ChevronRight className="h-5 w-5 text-slate-300" />
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color.fill }} />
              {box.name}
              {box.label && <span className="text-lg font-normal text-slate-500">· {box.label}</span>}
            </span>
          </nav>
          <p className="text-sm text-slate-500 mt-1">{box.rows} × {box.cols} grid · rows A–{rowLabel(box.rows)}, columns 1–{box.cols}</p>
        </div>
        <div className="flex gap-2 no-print">
          <Select aria-label="Select box" value={box.id} onChange={(e) => navigate(`/grid/${e.target.value}`)} className="sm:w-72">
            {activeBoxes.map((b) => (
              <option key={b.id} value={b.id}>{b.tank_name} › {b.rack_name} › {boxDisplay(b)}</option>
            ))}
          </Select>
          <Button variant="secondary" size="icon" onClick={() => window.print()} aria-label="Print box map" title="Print box map">
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tips canEdit={canEdit} />

      <Card className="p-5 mb-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filled</div>
            <div className="text-2xl font-semibold text-slate-900">{filled} <span className="text-base font-normal text-slate-400">/ {total}</span></div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Available</div>
            <div className="text-2xl font-semibold text-slate-900">{total - filled}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Utilization</div>
            <div className="text-2xl font-semibold text-brand-800">{fmtPct(filled, total)}</div>
          </div>
          <div className="flex-1 min-w-48 pb-2"><ProgressBar value={pct(filled, total)} /></div>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        {canEdit && (
          <div className={cx(
            'no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5',
            selecting ? 'bg-brand-50 border border-brand-100' : '',
          )}>
            {selecting === 'empty' && (
              <>
                <div className="text-sm text-slate-700 flex-1 min-w-48">
                  <span className="font-semibold text-brand-800">{selected.size} square{selected.size === 1 ? '' : 's'} selected.</span>{' '}
                  Click empty squares, or a row letter to select that whole row.
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear</Button>
                <Button variant="secondary" size="sm" onClick={stopSelecting}>Cancel</Button>
                <Button size="sm" disabled={!selected.size} onClick={() => setDialog({ type: 'add', positions: selectedPositions })}>
                  <Plus className="h-4 w-4" /> Fill {selected.size || ''} position{selected.size === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {selecting === 'samples' && (
              <>
                <div className="text-sm text-slate-700 flex-1 min-w-48">
                  <span className="font-semibold text-brand-800">{picked.size} sample{picked.size === 1 ? '' : 's'} selected.</span>{' '}
                  Click samples, or a row letter to select a whole row.
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</Button>
                <Button variant="secondary" size="sm" onClick={stopSelecting}>Cancel</Button>
                <Button variant="secondary" size="sm" disabled={!picked.size} onClick={() => setDialog({ type: 'remove', samples: pickedSamples })}>
                  <PackageOpen className="h-4 w-4" /> Take out
                </Button>
                <Button size="sm" disabled={!picked.size} onClick={() => setDialog({ type: 'transfer', samples: pickedSamples })}>
                  <ArrowRightLeft className="h-4 w-4" /> Move to another box
                </Button>
              </>
            )}
            {!selecting && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setSelecting('empty')} disabled={filled >= total}>
                  <ListChecks className="h-4 w-4" /> Fill several squares
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSelecting('samples')} disabled={!filled}>
                  <MousePointerClick className="h-4 w-4" /> Select samples
                </Button>
                <span className="text-xs text-slate-500">Select samples to move or take out several at once · drag a sample to move it within this box</span>
              </>
            )}
          </div>
        )}

        {samplesQ.isLoading ? <Spinner /> : samplesQ.error ? <ErrorState error={samplesQ.error} onRetry={samplesQ.refetch} /> : (
          <BoxGrid
            box={box}
            samples={samples}
            canEdit={canEdit}
            highlight={highlight}
            selecting={selecting}
            selected={selected}
            picked={picked}
            onPick={pick}
            onToggle={toggle}
            onToggleRow={toggleRow}
            onEmpty={(row, col) => setDialog({ type: 'add', positions: [{ row, col }] })}
            onSample={(sample) => setDialog({ type: 'details', sample })}
            onDropMove={dropMove}
          />
        )}
        <div className="mt-5 flex flex-wrap gap-5 text-xs text-slate-500 no-print">
          <span className="flex items-center gap-2"><span className="h-4 w-4 rounded border-2 border-dashed border-slate-300 bg-slate-50" /> Empty{canEdit && ' — click to add'}</span>
          <span className="flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: color.fill }} /> Occupied — click for details{canEdit && ', drag to move'}</span>
          <span>One square = one vial</span>
        </div>
      </Card>

      {dialog?.type === 'add' && (
        <SampleForm
          box={box}
          positions={dialog.positions}
          onClose={close}
          onSaved={stopSelecting}
        />
      )}
      {dialog?.type === 'details' && liveSample && (
        <SampleDetails
          sample={liveSample}
          box={box}
          onClose={close}
          onEdit={() => setDialog({ type: 'edit', sample: liveSample })}
          onMove={() => setDialog({ type: 'move', sample: liveSample })}
          onRemove={() => setDialog({ type: 'remove', sample: liveSample })}
        />
      )}
      {dialog?.type === 'edit' && (
        <SampleForm box={box} sample={dialog.sample} onClose={close} />
      )}
      {dialog?.type === 'move' && (
        <TransferDialog samples={[dialog.sample]} fromBox={box} onClose={close} onMoved={close} />
      )}
      {dialog?.type === 'notify' && (
        <NotifyMoveDialog moves={dialog.moves} onClose={close} />
      )}
      {dialog?.type === 'transfer' && (
        <TransferDialog samples={dialog.samples} fromBox={box} onClose={close} onMoved={() => { close(); stopSelecting(); }} />
      )}
      {dialog?.type === 'remove' && (
        <RemoveDialog
          samples={dialog.samples || [dialog.sample]}
          fromBox={box}
          onClose={close}
          onDone={() => { close(); stopSelecting(); }}
          onMoveInstead={() => setDialog({ type: 'transfer', samples: dialog.samples || [dialog.sample] })}
        />
      )}
    </>
  );
}
