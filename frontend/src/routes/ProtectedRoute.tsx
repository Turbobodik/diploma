import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Skeleton } from '../components/common/Skeleton';
import { AppShell } from '../components/layout/AppShell';
import { useAppSelector } from '../store/hooks';

export interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, initialized } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (!initialized) {
    return (
      <main className="app-content">
        <div className="surface-card stack-md">
          <Skeleton variant="title" />
          <Skeleton variant="line" count={3} />
        </div>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <AppShell>{children}</AppShell>;
}
