export interface SkeletonProps {
  variant?: 'line' | 'title' | 'block';
  count?: number;
}

export function Skeleton({ variant = 'line', count = 1 }: SkeletonProps) {
  return (
    <div className="stack-sm" aria-busy="true" aria-label="Loading content">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className={`skeleton skeleton-${variant}`} />
      ))}
    </div>
  );
}
