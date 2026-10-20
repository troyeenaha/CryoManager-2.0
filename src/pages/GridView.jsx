import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Grid3x3, Plus, Printer } from 'lucide-react';
import { useBoxSamples, useBoxes } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import SampleForm from '../components/SampleForm.jsx';
import { MoveDialog, RemoveDialog, SampleDetails } from '../components/SampleDetails.jsx';
import { boxColorOf, fmtPct, parsePosition, pct, positionLabel, rowLabel } from '../lib/grid.js';
import { fmtDate, yesNo } from '../lib/format.js';
import { Button, Card, EmptyState, ErrorState, ProgressBar, Select, Spinner, cx } from '../components/ui.jsx';

function Tooltip({ hover }) {
  if (!hover) return null;
  const { sample: s, rect } = hover;
  const top = rect.bottom + 8;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 130), window.innerWidth - 268);
  return (
    <div className="fixed z-40 w-[260px] pointer-events-none rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-sm" style={{ top, left }} role="tooltip">
      <div className="font-semibold text-slate-900 truncate">{s.sample_name}</div>
      <div className="text-xs text-slate-500 mb-2">{positionLabel(s.row_num, s.col_num)} · {s.sample_code}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-slate-500">Transfected</dt><dd>{yesNo(s.transfected)}</dd>
        <dt className="text-slate-500">Passage</dt><dd>{s.passage_number ?? '—'}</dd>
        <dt className="text-slate-500">Passaged by</dt><dd className="truncate">{s.passaged_by || '—'}</dd>
        <dt className="text-slate-500">Date</dt><dd>{fmtDate(s.passage_date)}</dd>
        <dt className="text-slate-500">Media</dt><dd className="truncate">{s.media || '—'}</dd>
        {s.vial_count > 1 && (<><dt className="text-slate-500">Vials</dt><dd>{s.vial_count}</dd></>)}
      </dl>
    </div>
  );
}

function BoxGrid({ box, samples, canEdit, highlight, onEmpty, onSample }) {
  const [hover, setHover] = useState(null);
  const gridRef = useRef(null);
  const color = boxColorOf(box);
  const byPos = useMemo(() => new Map(samples.map((s) => [`${s.row_num}-${s.col_num}`, s])), [samples]);

  useEffect(() => {
    if (!highlight) return;
    const el = gridRef.current?.querySelector(`[data-pos="${highlight.row}-${highlight.col}"]`);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  }, [highlight, samples]);

  // Arrow-key navigation between cells
  function onKeyDown(e) {
    const m = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!m) return;
    const [r, c] = (e.target.dataset.pos || '').split('-').map(Number);
    if (!r) return;
    const next = gridRef.current.querySelector(`[data-pos="${r + m[0]}-${c + m[1]}"]`);
    if (next) { e.preventDefault(); next.focus(); }
  }

  const cell = box.cols > 12 ? 'minmax(2.5rem,3.25rem)' : 'minmax(2.9rem,3.9rem)';
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2" onScroll={() => setHover(null)}>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Box ${box.name} grid, ${box.rows} rows by ${box.cols} columns`}
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
              <span className="flex items-center justify-center text-xs font-medium text-slate-400">{rowLabel(r)}</span>
              {Array.from({ length: box.cols }, (_, ci) => {
                const c = ci + 1;
                const s = byPos.get(`${r}-${c}`);
                const pos = positionLabel(r, c);
                const isHi = highlight?.row === r && highlight?.col === c;
                if (s) {
                  return (
                    <button
                      key={c}
                      role="gridcell"
                      data-pos={`${r}-${c}`}
                      onClick={() => onSample(s)}
                      onMouseEnter={(e) => setHover({ sample: s, rect: e.currentTarget.getBoundingClientRect() })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => setHover({ sample: s, rect: e.currentTarget.getBoundingClientRect() })}
                      onBlur={() => setHover(null)}
                      aria-label={`${pos}: ${s.sample_name}`}
                      className={cx(
                        'relative aspect-square rounded-lg border-2 px-0.5 flex flex-col items-center justify-center overflow-hidden transition-all duration-150',
                        'hover:-translate-y-px hover:shadow-md',
                        isHi && 'ring-4 ring-amber-400 ring-offset-1',
                      )}
                      style={{ background: color.fill, borderColor: color.fill, color: color.text }}
                    >
                      <span className="text-[9px] leading-none opacity-80">{pos}</span>
                      <span className="mt-0.5 text-[10px] font-semibold leading-tight text-center line-clamp-2 break-words">{s.sample_name}</span>
                      {s.vial_count > 1 && (
                        <span className="absolute top-0.5 right-0.5 rounded bg-white/90 text-slate-800 text-[8px] font-bold px-0.5 leading-tight">×{s.vial_count}</span>
                      )}
                    </button>
                  );
                }
                return (
                  <button
                    key={c}
                    role="gridcell"
                    data-pos={`${r}-${c}`}
                    disabled={!canEdit}
                    onClick={() => onEmpty(r, c)}
                    aria-label={`${pos}: empty${canEdit ? ', add sample' : ''}`}
                    title={canEdit ? `Add sample at ${pos}` : `${pos} (empty)`}
                    className={cx(
                      'group aspect-square rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center transition-all duration-150',
                      canEdit && 'hover:border-brand-500 hover:bg-brand-50',
                      !canEdit && 'cursor-default',
                      isHi && 'ring-4 ring-amber-400 ring-offset-1',
                    )}
                  >
                    <span className="text-[9px] leading-none text-slate-300 group-hover:text-brand-700">{pos}</span>
                    {canEdit && <Plus className="h-3.5 w-3.5 mt-0.5 text-slate-300 group-hover:text-brand-700" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <Tooltip hover={hover} />
    </div>
  );
}

export default function GridViewPage() {
  const { boxId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const boxesQ = useBoxes();
  const activeBoxes = useMemo(() => (boxesQ.data || []).filter((b) => b.status === 'active'), [boxesQ.data]);
  const box = (boxesQ.data || []).find((b) => b.id === boxId);
  const samplesQ = useBoxSamples(box?.id);
  const [dialog, setDialog] = useState(null); // {type, ...}
  const highlight = useMemo(() => parsePosition(params.get('pos')), [params]);

  useEffect(() => {
    if (!boxId && activeBoxes.length) navigate(`/grid/${activeBoxes[0].id}`, { replace: true });
  }, [boxId, activeBoxes, navigate]);

  // Keep an open sample dialog in sync with live data (e.g. after an edit elsewhere)
  const liveSample = dialog?.sample && (samplesQ.data || []).find((s) => s.id === dialog.sample.id);
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

  const samples = samplesQ.data || [];
  const filled = samples.length;
  const total = box.rows * box.cols;
  const color = boxColorOf(box);
  const close = () => setDialog(null);

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <nav aria-label="Location" className="flex items-center flex-wrap gap-1 text-2xl font-semibold tracking-tight text-slate-900">
            <span>{box.tank_name}</span>
            <ChevronRight className="h-5 w-5 text-slate-300" />
            <span>{box.rack_name}</span>
            <ChevronRight className="h-5 w-5 text-slate-300" />
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color.fill }} />
              {box.name}
            </span>
          </nav>
          <p className="text-sm text-slate-500 mt-1">{box.rows} × {box.cols} grid · rows A–{rowLabel(box.rows)}, columns 1–{box.cols}</p>
        </div>
        <div className="flex gap-2 no-print">
          <Select aria-label="Select box" value={box.id} onChange={(e) => navigate(`/grid/${e.target.value}`)} className="sm:w-72">
            {activeBoxes.map((b) => (
              <option key={b.id} value={b.id}>{b.tank_name} › {b.rack_name} › {b.name}</option>
            ))}
          </Select>
          <Button variant="secondary" size="icon" onClick={() => window.print()} aria-label="Print box map" title="Print box map">
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
        {samplesQ.isLoading ? <Spinner /> : samplesQ.error ? <ErrorState error={samplesQ.error} onRetry={samplesQ.refetch} /> : (
          <BoxGrid
            box={box}
            samples={samples}
            canEdit={canEdit}
            highlight={highlight}
            onEmpty={(row, col) => setDialog({ type: 'add', row, col })}
            onSample={(sample) => setDialog({ type: 'details', sample })}
          />
        )}
        <div className="mt-5 flex flex-wrap gap-5 text-xs text-slate-500 no-print">
          <span className="flex items-center gap-2"><span className="h-4 w-4 rounded border-2 border-dashed border-slate-300 bg-slate-50" /> Empty{canEdit && ' — click to add'}</span>
          <span className="flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: color.fill }} /> Occupied — click for details</span>
          <span className="flex items-center gap-2"><span className="rounded bg-slate-100 px-1 font-bold text-[9px]">×3</span> Several vials in one slot</span>
        </div>
      </Card>

      {dialog?.type === 'add' && (
        <SampleForm box={box} row={dialog.row} col={dialog.col} onClose={close} />
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
        <SampleForm box={box} row={dialog.sample.row_num} col={dialog.sample.col_num} sample={dialog.sample} onClose={close} />
      )}
      {dialog?.type === 'move' && (
        <MoveDialog sample={dialog.sample} fromBox={box} onClose={close} onMoved={close} />
      )}
      {dialog?.type === 'remove' && (
        <RemoveDialog sample={dialog.sample} onClose={close} onDone={close} />
      )}
    </>
  );
}
