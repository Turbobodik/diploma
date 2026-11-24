import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Skeleton } from '../components/common/Skeleton';
import { ProtectedRoute } from './ProtectedRoute';

const LoginPage = lazy(() => import('../pages/LoginPage'));
const ProjectsPage = lazy(() => import('../pages/ProjectsPage'));
const WorkspacePage = lazy(() => import('../pages/WorkspacePage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const DesignSystemPage = lazy(() => import('../pages/DesignSystemPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

function RouteFallback() {
  return (
    <main className="app-content">
      <div className="surface-card stack-md">
        <Skeleton variant="title" />
        <Skeleton variant="block" />
      </div>
    </main>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <ProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <WorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/design-system"
          element={
            <ProtectedRoute>
              <DesignSystemPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
