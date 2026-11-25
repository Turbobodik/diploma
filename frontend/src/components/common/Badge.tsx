import type { ReactNode } from 'react';

export type BadgeVariant =
  'neutral' | 'entailment' | 'contradiction' | 'success' | 'error' | 'info' | 'warning';

export interface BadgeProps {
  variant?: BadgeVariant;
  title?: string;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', title, children }: BadgeProps) {
  return (
    <span className={`badge badge-${variant}`} title={title}>
      {children}
    </span>
  );
}
