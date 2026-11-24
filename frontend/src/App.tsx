import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastContainer } from './components/common/ToastContainer';
import { AppRouter } from './routes/AppRouter';
import { registerHttpHandlers } from './services/httpClient';
import { logout, restoreSession } from './store/authSlice';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { pushToast, setGlobalError } from './store/uiSlice';

export default function App() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);
  const scale = useAppSelector((state) => state.ui.scale);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.scale = scale;
  }, [scale]);

  useEffect(() => {
    registerHttpHandlers({
      onUnauthorized: () => {
        dispatch(logout());
        dispatch(
          pushToast({
            variant: 'warning',
            title: 'Session expired',
            description: 'Please sign in again to continue.',
          }),
        );
      },
      onGlobalError: (error) => {
        const suffix = error.requestId ? ` (ref: ${error.requestId.slice(0, 8)})` : '';
        dispatch(setGlobalError(`${error.message}${suffix}`));
        dispatch(
          pushToast({
            variant: 'error',
            title: error.status > 0 ? `Request error (${error.status})` : 'Network error',
            description: error.message,
          }),
        );
      },
    });
    void dispatch(restoreSession());
  }, [dispatch]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRouter />
        <ToastContainer />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
