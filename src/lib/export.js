import { buildXlsx } from './xlsx.js';

/**
 * A "table" is { columns: [{ key, label, value?(row) }], rows: [...] }.
 * Exports are plain CSV / Excel so the data is never locked in.
 */
export function tableToMatrix({ columns, rows }) {
  return [
    columns.map((c) => c.label),
    ...rows.map((r) =>
      columns.map((c) => {
        const v = c.value ? c.value(r) : r[c.key];
        return v === undefined ? '' : v;
      }),
    ),
  ];
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Stop spreadsheet formula injection from text fields.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(matrix) {
  return matrix.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function downloadCsv(table, title) {
  const blob = new Blob(['﻿' + toCsv(tableToMatrix(table))], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `cryomanager-${slug(title)}-${stamp()}.csv`);
}

export function downloadXlsx(sheets, title) {
  // sheets: [{ name, table }]
  const blob = buildXlsx(sheets.map((s) => ({ name: s.name, rows: tableToMatrix(s.table) })));
  downloadBlob(blob, `cryomanager-${slug(title)}-${stamp()}.xlsx`);
}
