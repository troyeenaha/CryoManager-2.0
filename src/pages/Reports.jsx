import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Boxes as BoxesIcon, ChevronDown, Container, Download, FileSpreadsheet, FlaskConical,
  Grid3x3, LayoutList, ChartPie, Search, SlidersHorizontal, SquareDashed,
} from 'lucide-react';
import { keys, searchSamples, useProfiles, useStats } from '../api/data.js';
import { REPORTS, SAMPLE_COLUMNS } from '../api/reports.js';
import { downloadCsv, downloadXlsx } from '../lib/export.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, yesNo } from '../lib/format.js';
import { boxColorOf, fmtPct, pct } from '../lib/grid.js';
import { useToast } from '../components/Toast.jsx';
import { SampleDetails } from '../components/SampleDetails.jsx';
import {
  Button, Card, ErrorState, Field, Input, PageHeader, ProgressBar, SearchInput, Select, Spinner, StatusBadge, cx,
} from '../components/ui.jsx';

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
        <Icon className="h-4 w-4 text-brand-700" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </Card>
  );
}

function Dashboard() {
  const { data: s, isLoading, error, refetch } = useStats();
  if (isLoading) return <Spinner className="py-8" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const util = pct(s.occupied_positions, s.total_positions);
  return (
    <section aria-label="Inventory statistics" className="mb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Container} label="Tanks" value={s.tanks} />
        <Stat icon={LayoutList} label="Racks" value={s.racks} />
        <Stat icon={BoxesIcon} label="Boxes" value={s.boxes} />
        <Stat icon={FlaskConical} label="Samples" value={s.samples} sub="One vial per position" />
        <Stat icon={Grid3x3} label="Total positions" value={s.total_positions.toLocaleString()} />
        <Stat icon={SquareDashed} label="Available" value={s.available_positions.toLocaleString()} />
        <Stat icon={ChartPie} label="Occupied" value={s.occupied_positions.toLocaleString()} />
        <Card className="p-4">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Utilization</div>
          <div className="mt-2 text-2xl font-semibold text-brand-800">{fmtPct(s.occupied_positions, s.total_positions)}</div>
          <ProgressBar value={util} className="mt-2" />
        </Card>
      </div>
      <p className="text-xs text-slate-500 mt-2">Utilization counts occupied physical positions in active boxes, not sample names.</p>
    </section>
  );
}

function groupByCellLine(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const k = (r.sample_name || '').trim().toLowerCase();
    if (!map.has(k)) map.set(k, { key: k, name: r.sample_name.trim(), rows: [] });
    map.get(k).rows.push(r);
  });
  return [...map.values()].map((g) => {
    const boxes = new Set(g.rows.map((r) => r.box_id));
    const passagers = [...new Set(g.rows.map((r) => r.passaged_by).filter(Boolean))].sort();
    const constructs = [...new Set(g.rows.filter((r) => r.transfected && r.transfected_with).map((r) => r.transfected_with))];
    const untransfected = g.rows.filter((r) => r.transfected === false).length;
    return { ...g, boxes: boxes.size, passagers, constructs, untransfected };
  });
}

function CellLineGroup({ group, open, onToggle, onOpenRow, nameOf }) {
  const n = group.rows.length;
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex flex-col items-center justify-center rounded-xl brand-gradient text-white h-14 min-w-14 px-2 shrink-0">
          <span className="text-xl font-semibold leading-none">{n}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-90 mt-0.5">vial{n === 1 ? '' : 's'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 truncate">{group.name}</div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>in {group.boxes} box{group.boxes === 1 ? '' : 'es'}</span>
            {group.constructs.length > 0 && <span>Transfected: {group.constructs.join(', ')}</span>}
            {group.untransfected > 0 && <span>{group.untransfected} not transfected</span>}
            {group.passagers.length > 0 && <span>Passaged by {group.passagers.join(', ')}</span>}
          </div>
        </div>
        <ChevronDown className={cx('h-5 w-5 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Grid name</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Passage</th>
                <th className="px-4 py-2.5">Who passaged</th>
                <th className="px-4 py-2.5">Date of passage</th>
                <th className="px-4 py-2.5">Transfection</th>
                <th className="px-4 py-2.5 hidden lg:table-cell">Freezing media</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {group.rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => onOpenRow(r)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpenRow(r)}
                  className="cursor-pointer hover:bg-brand-50/50 focus:bg-brand-50/50 focus:outline-none"
                >
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-brand-800">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: boxColorOf(r).fill }} />
                      {r.grid_name || `${r.box_name}${r.position}`}
                    </span>
                    {r.status !== 'active' && <div className="mt-0.5"><StatusBadge status={r.status} /></div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                    {r.tank_name} › Rack {r.rack_name} › Box {r.box_name}
                    {r.box_label && <span className="text-slate-400"> · {r.box_label}</span>}
                    <div className="text-xs text-slate-500">Position {r.position}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{r.passage_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    <span className="font-semibold">{r.passaged_by || '—'}</span>
                    {nameOf(r.passaged_by) && <span className="text-slate-500"> · {nameOf(r.passaged_by)}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{fmtDate(r.passage_date)}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {r.transfected === true ? <>Yes{r.transfected_with && <span className="text-slate-500"> — {r.transfected_with}</span>}</> : yesNo(r.transfected)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 hidden lg:table-cell">{r.media || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SearchSection() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: people } = useProfiles();
  const [term, setTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState({ status: 'active', transfected: 'any', researcher: '', dateFrom: '', dateTo: '' });
  const [details, setDetails] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const dTerm = useDebounced(term.trim(), 300);
  const dResearcher = useDebounced(f.researcher.trim(), 300);
  const hasFilters = f.status !== 'active' || f.transfected !== 'any' || dResearcher || f.dateFrom || f.dateTo;
  const active = Boolean(dTerm || hasFilters);
  const params = { term: dTerm, ...f, researcher: dResearcher };

  const q = useQuery({
    queryKey: keys.search({ ...params, people: (people || []).length }),
    queryFn: () => searchSamples({ ...params, people }),
    enabled: active,
    placeholderData: keepPreviousData,
  });
  const rows = active ? q.data?.rows || [] : [];
  const count = active ? q.data?.count || 0 : 0;
  const groups = useMemo(() => groupByCellLine(rows), [rows]);
  useEffect(() => setOpenGroups(new Set()), [dTerm, dResearcher, f.status, f.transfected, f.dateFrom, f.dateTo]);

  const nameOf = (ini) => (people || []).find((p) => p.initials && p.initials === ini)?.full_name;
  const isOpen = (g) => groups.length === 1 || openGroups.has(g.key);
  const toggle = (g) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
    return next;
  });

  function openRow(r) {
    if (r.status === 'active') navigate(`/grid/${r.box_id}?pos=${r.position}`);
    else setDetails(r);
  }

  function exportResults(kind) {
    setExporting(true);
    try {
      const table = { columns: SAMPLE_COLUMNS, rows };
      if (kind === 'csv') downloadCsv(table, 'search-results');
      else downloadXlsx([{ name: 'Search results', table }], 'search-results');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setExporting(false);
    }
  }

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const activeFilters = (f.status !== 'active') + (f.transfected !== 'any') + Boolean(f.researcher) + Boolean(f.dateFrom || f.dateTo);

  return (
    <section aria-labelledby="search-h" className="mb-10">
      <h2 id="search-h" className="text-lg font-semibold text-slate-900 mb-3">Find cells</h2>
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Type any word: cell line, construct, person, box nickname, A1B4…"
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              <SlidersHorizontal className="h-4 w-4" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
            </Button>
            <Button variant="secondary" onClick={() => exportResults('csv')} loading={exporting} disabled={!count}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="secondary" onClick={() => exportResults('xlsx')} disabled={!count || exporting}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          One word is enough. For example <em>HER2</em>, <em>Greg</em>, <em>Thurber</em>, <em>GT</em> or <em>A1B4</em>. Add a second word to narrow it down, e.g. <em>HER2 Greg</em>.
        </p>
        {showFilters && (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4 border-t border-slate-100">
            <Field label="Status">
              <Select value={f.status} onChange={set('status')}>
                <option value="active">In storage</option>
                <option value="archived">Used / thawed</option>
                <option value="removed">Discarded</option>
                <option value="any">All</option>
              </Select>
            </Field>
            <Field label="Transfected">
              <Select value={f.transfected} onChange={set('transfected')}>
                <option value="any">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Person"><Input value={f.researcher} onChange={set('researcher')} placeholder="Name or initials" /></Field>
            <Field label="Passage date from"><Input type="date" value={f.dateFrom} onChange={set('dateFrom')} /></Field>
            <Field label="Passage date to"><Input type="date" value={f.dateTo} onChange={set('dateTo')} /></Field>
          </div>
        )}
      </Card>

      <div className="mt-4">
        {!active ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <Search className="h-6 w-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Type a cell line or any keyword above to see how many vials there are and where they are.</p>
          </div>
        ) : q.isLoading ? <Spinner /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : !rows.length ? (
          <p className="text-center text-sm text-slate-500 py-10">No vials match.</p>
        ) : (
          <div className={cx('space-y-3', q.isFetching && 'opacity-60')}>
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{count.toLocaleString()} vial{count === 1 ? '' : 's'}</strong>
              {groups.length > 1 && <> of <strong className="text-slate-900">{groups.length}</strong> cell lines</>} found.
              {groups.length > 1 && ' Click a cell line to see every vial.'}
              {count > rows.length && ` Showing the first ${rows.length}; add more words to narrow it down.`}
            </p>
            {groups.map((g) => (
              <CellLineGroup key={g.key} group={g} open={isOpen(g)} onToggle={() => toggle(g)} onOpenRow={openRow} nameOf={nameOf} />
            ))}
          </div>
        )}
      </div>

      {details && (
        <SampleDetails
          readOnly
          sample={details}
          box={{ name: details.box_name, label: details.box_label, rack_name: details.rack_name, tank_name: details.tank_name, rack_color: details.rack_color, shade_index: details.shade_index, shade_count: details.shade_count }}
          onClose={() => setDetails(null)}
        />
      )}
    </section>
  );
}

function ReportsList() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  async function run(report, kind) {
    setBusy(`${report.id}-${kind}`);
    try {
      const sheets = await report.build();
      if (kind === 'csv') downloadCsv(sheets[0].table, report.title);
      else downloadXlsx(sheets, report.title);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section aria-labelledby="reports-h">
      <h2 id="reports-h" className="text-lg font-semibold text-slate-900 mb-3">Download reports</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900">{r.title}</div>
              <div className="text-sm text-slate-500">{r.description}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" size="sm" loading={busy === `${r.id}-csv`} disabled={Boolean(busy)} onClick={() => run(r, 'csv')}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button variant="secondary" size="sm" loading={busy === `${r.id}-xlsx`} disabled={Boolean(busy)} onClick={() => run(r, 'xlsx')}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Search the whole inventory, see storage statistics and download reports" />
      <Dashboard />
      <SearchSection />
      <ReportsList />
    </>
  );
}
