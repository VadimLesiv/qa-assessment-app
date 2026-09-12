import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Badge } from '@qa/shared';

type ToastKind = 'xp' | 'badge' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  icon: string;
  title: string;
  text?: string;
}

interface ToastApi {
  /** Celebrates an XP gain. Silently ignores zero so callers need no guard. */
  xp: (amount: number, reason?: string) => void;
  badges: (badges: Badge[]) => void;
  error: (message: string) => void;
  info: (title: string, text?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 3600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      xp: (amount, reason) => {
        if (amount <= 0) return;
        push({ kind: 'xp', icon: '⚡', title: `+${amount} XP`, ...(reason ? { text: reason } : {}) });
      },
      badges: (badges) => {
        for (const badge of badges) {
          push({ kind: 'badge', icon: badge.icon, title: `Badge unlocked: ${badge.name}`, text: badge.description });
        }
      },
      error: (message) => push({ kind: 'error', icon: '⚠️', title: 'Something went wrong', text: message }),
      info: (title, text) => push({ kind: 'info', icon: 'ℹ️', title, ...(text ? { text } : {}) }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live lets screen readers announce XP and badge gains. */}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <span className="toast-icon" aria-hidden="true">
              {toast.icon}
            </span>
            <div>
              <div className="toast-title">{toast.title}</div>
              {toast.text && <div className="toast-text">{toast.text}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
