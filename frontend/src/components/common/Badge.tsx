import type { ReactNode } from 'react';

export type BadgeVariant =
  'neutral' | 'entailment' | 'contradiction' | 'success' | 'error' | 'info' | 'warning';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
