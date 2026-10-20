export const rowLabel = (row) => String.fromCharCode(64 + row); // 1 → A
export const positionLabel = (row, col) => `${rowLabel(row)}${col}`;

/** "B12" → { row: 2, col: 12 } (or null) */
export function parsePosition(label) {
  const m = /^([A-Za-z])(\d{1,2})$/.exec((label || '').trim());
  if (!m) return null;
  return { row: m[1].toUpperCase().charCodeAt(0) - 64, col: Number(m[2]) };
}

export const BOX_COLORS = [
  { id: 'blue', label: 'Blue', fill: '#3B82F6', soft: '#DBEAFE', text: '#FFFFFF' },
  { id: 'teal', label: 'Teal', fill: '#0F766E', soft: '#CCFBF1', text: '#FFFFFF' },
  { id: 'green', label: 'Green', fill: '#10B981', soft: '#D1FAE5', text: '#FFFFFF' },
  { id: 'purple', label: 'Purple', fill: '#8B5CF6', soft: '#EDE9FE', text: '#FFFFFF' },
  { id: 'pink', label: 'Pink', fill: '#EC4899', soft: '#FCE7F3', text: '#FFFFFF' },
  { id: 'red', label: 'Red', fill: '#EF4444', soft: '#FEE2E2', text: '#FFFFFF' },
  { id: 'orange', label: 'Orange', fill: '#F97316', soft: '#FFEDD5', text: '#FFFFFF' },
  { id: 'yellow', label: 'Yellow', fill: '#FACC15', soft: '#FEF9C3', text: '#0F172A' },
  { id: 'slate', label: 'Gray', fill: '#64748B', soft: '#F1F5F9', text: '#FFFFFF' },
];

export const boxColor = (id) => BOX_COLORS.find((c) => c.id === id) || BOX_COLORS[0];
export const RACK_COLORS = BOX_COLORS;

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * Shade `index` (1-based) of `count` boxes in a rack of color `rackColorId`:
 * the first box is lightest, the last darkest, the middle ≈ the rack color.
 */
export function rackShade(rackColorId, index = 1, count = 1) {
  const base = hexToRgb(boxColor(rackColorId).fill);
  const t = count <= 1 ? 0.5 : (index - 1) / (count - 1);
  const rgb = t < 0.5
    ? mix(mix(base, [255, 255, 255], 0.5), base, t * 2)
    : mix(base, mix(base, [0, 0, 0], 0.4), (t - 0.5) * 2);
  return {
    fill: rgbToHex(rgb),
    soft: rgbToHex(mix(rgb, [255, 255, 255], 0.75)),
    text: luminance(rgb) > 0.62 ? '#0F172A' : '#FFFFFF',
  };
}

/** Color for any row that carries rack_color / shade_index / shade_count. */
export const boxColorOf = (row) => rackShade(row?.rack_color || row?.color || 'blue', row?.shade_index, row?.shade_count);

export const GRID_PRESETS = [
  { label: '9 × 9 (81)', rows: 9, cols: 9 },
  { label: '10 × 10 (100)', rows: 10, cols: 10 },
  { label: '12 × 12 (144)', rows: 12, cols: 12 },
];

export const pct = (n, d) => (d > 0 ? (n / d) * 100 : 0);
export const fmtPct = (n, d) => `${pct(n, d).toFixed(1)}%`;
