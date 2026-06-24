import type { PropsWithChildren } from 'react';
import './Panel.css';

interface PanelProps {
  title?: string;
  eyebrow?: string;
  className?: string;
}

export function Panel({ title, eyebrow, className = '', children }: PropsWithChildren<PanelProps>) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(eyebrow || title) && (
        <header className="panel__header">
          {eyebrow && <span className="panel__eyebrow">{eyebrow}</span>}
          {title && <h2>{title}</h2>}
        </header>
      )}
      {children}
    </section>
  );
}
