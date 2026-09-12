import type { ReactNode } from 'react';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading">
      <div className="stack" style={{ alignItems: 'center' }}>
        <div className="spinner" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      {message}
    </div>
  );
}

interface EmptyProps {
  icon: string;
  title: string;
  children?: ReactNode;
}

export function Empty({ icon, title, children }: EmptyProps) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="empty-title">{title}</span>
      {children}
    </div>
  );
}
