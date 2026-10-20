import { createContext, useCallback, useContext, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone, message, action) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, tone, message, action }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : action ? 9000 : 4000);
    },
    [dismiss],
  );
  const api = {
    success: (m, action) => push('success', m, action),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };
  const icons = { success: CircleCheck, error: CircleAlert, info: Info };
  const colors = { success: 'text-emerald-500', error: 'text-red-500', info: 'text-blue-500' };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="animate-toast flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              <Icon className={`h-5 w-5 shrink-0 ${colors[t.tone]}`} />
              <div className="flex-1">
                <p className="text-sm text-slate-700">{t.message}</p>
                {t.action && (
                  <button
                    onClick={() => { dismiss(t.id); t.action.onClick(); }}
                    className="mt-1.5 text-sm font-medium text-brand-700 hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
