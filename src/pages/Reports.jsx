import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Boxes as BoxesIcon, ChevronLeft, ChevronRight, Container, Download, FileSpreadsheet, FlaskConical,
  Grid3x3, LayoutList, ChartPie, SlidersHorizontal, SquareDashed,
} from 'lucide-react';
import { keys, searchSamples, useStats } from '../api/data.js';
import { REPORTS, SAMPLE_COLUMNS } from '../api/reports.js';
import { downloadCsv, downloadXlsx } from '../lib/export.js';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, yesNo } from '../lib/format.js';
import { boxColor, fmtPct, pct } from '../lib/grid.js';
import { useToast } from '../components/Toast.jsx';
import { SampleDetails } from '../components/SampleDetails.jsx';
import {
  Badge, Button, Card, ErrorState, Field, Input, PageHeader, ProgressBar, SearchInput, Select, Spinner, StatusBadge, cx,
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
        <Stat icon={FlaskConical} label="Samples" value={s.samples} sub={`${s.vials} vial${s.vials === 1 ? '' : 's'}`} />
        <Stat icon={Grid3x3} label="Total positions" value={s.total_positions.toLocaleString()} />
        <Stat icon={SquareDashed} label="Available" value={s.available_positions.toLocaleString()} />
        <Stat icon={ChartPie} label="Occupied" value={s.occupied_positions.toLocaleString()} />
        <Card className="p-4">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Utilization</div>
          <div className="mt-2 text-2xl font-semibold text-brand-800">{fmtPct(s.occupied_positions, s.total_positions)}</div>
          <ProgressBar value={util} className="mt-2" />
        </Card>
      </div>
      <p className="text-xs text-slate-500 mt-2">Utilization counts occupied physical positions in active boxes, not sample names or vials.</p>
    </section>
  );
}

const PAGE = 50;

function SearchSection() {
  const navigate = useNavigate();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState({ status: 'active', transfected: 'any', researcher: '', dateFrom: '', dateTo: '' });
  const [page, setPage] = useState(0);
  const [details, setDetails] = useState(null);
  const [exporting, setExporting] = useState(false);
  const dTerm = useDebounced(term);
  const dResearcher = useDebounced(f.researcher);
  const params = { term: dTerm, ...f, researcher: dResearcher, page, pageSize: PAGE };
  useEffect(() => setPage(0), [dTerm, f.status, f.transfected, dResearcher, f.dateFrom, f.dateTo]);

  const q = useQuery({ queryKey: keys.search(params), queryFn: () => searchSamples(params), placeholderData: keepPreviousData });
  const rows = q.data?.rows || [];
  const count = q.data?.count || 0;
  const pages = Math.max(1, Math.ceil(count / PAGE));

  function open(r) {
    if (r.status === 'active') navigate(`/grid/${r.box_id}?pos=${r.position}`);
    else setDetails(r);
  }

  async function exportResults(kind) {
    setExporting(true);
    try {
      const all = await searchSamples({ ...params, all: true });
      const table = { columns: SAMPLE_COLUMNS, rows: all.rows };
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
      <h2 id="search-h" className="text-lg font-semibold text-slate-900 mb-3">Find a sample</h2>
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Search name, cell line, ID, position, tank, rack, box, researcher, passage…"
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
        {showFilters && (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-4 border-t border-slate-100">
            <Field label="Status">
              <Select value={f.status} onChange={set('status')}>
                <option value="active">In storage</option>
                <option value="archived">Archived</option>
                <option value="removed">Removed</option>
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
            <Field label="Researcher"><Input value={f.researcher} onChange={set('researcher')} placeholder="Name" /></Field>
            <Field label="Passage date from"><Input type="date" value={f.dateFrom} onChange={set('dateFrom')} /></Field>
            <Field label="Passage date to"><Input type="date" value={f.dateTo} onChange={set('dateTo')} /></Field>
          </div>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        {q.isLoading ? <Spinner /> : q.error ? <div className="p-4"><ErrorState error={q.error} onRetry={q.refetch} /></div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Sample</th>
                    <th className="px-4 py-3">Tank</th>
                    <th className="px-4 py-3">Rack</th>
                    <th className="px-4 py-3">Box</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3 hidden md:table-cell">Passage</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Transfected</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Researcher</th>
                    <th className="px-4 py-3 hidden xl:table-cell">Passage date</th>
                  </tr>
                </thead>
                <tbody className={cx('divide-y divide-slate-100', q.isFetching && 'opacity-60')}>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => open(r)}
                      onKeyDown={(e) => e.key === 'Enter' && open(r)}
                      className="cursor-pointer hover:bg-brand-50/50 focus:bg-brand-50/50 focus:outline-none"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.sample_name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          {r.sample_code}
                          {r.status !== 'active' && <StatusBadge status={r.status} />}
                          {r.vial_count > 1 && <Badge tone="blue">{r.vial_count} vials</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.tank_name}</td>
                      <td className="px-4 py-3 text-slate-700">{r.rack_name}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: boxColor(r.box_color).fill }} />{r.box_name}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="font-semibold text-brand-800">{r.position}</span></td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-700">{r.passage_number ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-700">{yesNo(r.transfected)}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-700">{r.researcher_responsible || r.passaged_by || '—'}</td>
                      <td className="px-4 py-3 hidden xl:table-cell text-slate-700">{fmtDate(r.passage_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && <p className="text-center text-sm text-slate-500 py-10">No samples match.</p>}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
              <span>{count.toLocaleString()} result{count === 1 ? '' : 's'}</span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                  <span>Page {page + 1} of {pages}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {details && (
        <SampleDetails
          readOnly
          sample={details}
          box={{ name: details.box_name, rack_name: details.rack_name, tank_name: details.tank_name, color: details.box_color }}
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
