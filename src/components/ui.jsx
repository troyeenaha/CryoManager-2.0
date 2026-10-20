import { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, LoaderCircle, EllipsisVertical, Search, X } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

// ---------------------------------------------------------------- Button

const VARIANTS = {
  primary: 'brand-gradient text-white shadow-sm hover:brightness-95 hover:shadow disabled:opacity-60',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60',
  danger: 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-60',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props },
  ref,
) {
  const sizes = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', icon: 'h-9 w-9 justify-center' };
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 whitespace-nowrap',
        sizes[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Form controls

const inputBase =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'transition-colors focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-100 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 read-only:bg-slate-50';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(inputBase, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} rows={3} className={cx(inputBase, 'py-2 resize-y', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx(inputBase, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export function Field({ label, required, hint, error, children, className }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children, { id: children.props.id || id, 'aria-invalid': error ? true : undefined })
    : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {child}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'px-3.5 h-8 text-sm rounded-md transition-colors',
            value === o.value ? 'bg-white text-brand-800 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Display

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'slate', children, className }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    teal: 'bg-brand-50 text-brand-800 ring-brand-700/20',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active: ['green', 'Active'],
    inactive: ['slate', 'Inactive'],
    archived: ['amber', 'Archived'],
    removed: ['red', 'Removed'],
    pending: ['amber', 'Pending'],
    disabled: ['red', 'Disabled'],
  };
  const [tone, label] = map[status] || ['slate', status];
  return (
    <Badge tone={tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </Badge>
  );
}

export function ProgressBar({ value, className }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 90 ? 'bg-red-500' : v >= 75 ? 'bg-amber-500' : 'brand-gradient';
  return (
    <div className={cx('h-2 w-full rounded-full bg-slate-100 overflow-hidden', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all duration-300', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Alert({ tone = 'info', children, className }) {
  const tones = {
    info: ['bg-blue-50 border-blue-200 text-blue-800', Info],
    success: ['bg-emerald-50 border-emerald-200 text-emerald-800', CircleCheck],
    error: ['bg-red-50 border-red-200 text-red-800', CircleAlert],
    warning: ['bg-amber-50 border-amber-200 text-amber-800', CircleAlert],
  };
  const [cls, Icon] = tones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', cls, className)}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Loading…', className }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-16 text-sm text-slate-500', className)} role="status">
      <LoaderCircle className="h-5 w-5 animate-spin text-brand-700" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <Card className="flex flex-col items-center text-center px-6 py-14">
      {Icon && (
        <div className="h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-brand-700" />
        </div>
      )}
      <h3 className="font-medium text-slate-900">{title}</h3>
      {children && <p className="mt-1 text-sm text-slate-500 max-w-sm">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <Alert tone="error">
      <div className="font-medium">Could not load data</div>
      <div className="mt-0.5">{error?.message || String(error)}</div>
      {onRetry && (
        <button className="mt-2 underline font-medium" onClick={onRetry}>
          Try again
        </button>
      )}
    </Alert>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Modal

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', busy = false }) {
  const panel = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector('input:not([readonly]):not([type=hidden]),select,textarea,button:not([data-close])');
      (first || panel.current)?.focus();
    }, 20);
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocus.current?.focus?.();
    };
  }, [open, onClose, busy]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cx(
          'animate-modal relative w-full bg-white shadow-xl border border-slate-200 flex flex-col',
          'rounded-t-2xl sm:rounded-2xl max-h-[92vh]',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button data-close aria-label="Close" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'danger', busy, requireText }) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);
  const blocked = requireText && typed.trim() !== requireText;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600 space-y-3">{children}</div>
      {requireText && (
        <Field label={`Type "${requireText}" to confirm`} className="mt-4">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Menu (three dots)

export function Menu({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 min-w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {visible.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
              className={cx(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50',
                it.danger ? 'text-red-600' : 'text-slate-700',
              )}
            >
              {it.icon && <it.icon className="h-4 w-4" />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
