import { Activity, MonitorSmartphone, Moon, RefreshCw, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Select } from '../components/common/Select';
import { Skeleton } from '../components/common/Skeleton';
import { useDeviceProfile } from '../hooks/useDeviceProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { HealthResponse } from '../models/api';
import type { DisplayScale } from '../models/ui';
import { normalizeAxiosError } from '../services/httpClient';
import { workspaceService } from '../services/workspaceService';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setScale, setTheme } from '../store/uiSlice';

const SCALE_OPTIONS = [
  { value: '0.9', label: 'Compact (90%)' },
  { value: '1', label: 'Default (100%)' },
  { value: '1.12', label: 'Comfortable (112%)' },
  { value: '1.25', label: 'Large text (125%)' },
];

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const dispatch = useAppDispatch();
  const { theme, scale } = useAppSelector((state) => state.ui);
  const device = useDeviceProfile();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const loadHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await workspaceService.getHealth();
      setHealth(data);
    } catch (err) {
      setHealthError(normalizeAxiosError(err).message);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void workspaceService
      .getHealth()
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
          setHealthError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHealthError(normalizeAxiosError(err).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHealthLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack-lg">
      <header className="page-header">
        <div className="page-header-copy">
          <h1>Display & Environment Settings</h1>
          <p className="text-secondary">
            Customize visual appearance, inspect adaptive viewport detection, and verify API health.
          </p>
        </div>
      </header>

      <div className="grid-2">
        <section className="surface-card stack-md" aria-label="Appearance settings">
          <h2>Appearance</h2>
          <div className="cluster">
            <Button
              variant={theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => dispatch(setTheme('light'))}
              id="settings-theme-light"
            >
              <Sun size={16} aria-hidden="true" />
              Light theme
            </Button>
            <Button
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => dispatch(setTheme('dark'))}
              id="settings-theme-dark"
            >
              <Moon size={16} aria-hidden="true" />
              Dark theme
            </Button>
          </div>

          <Select
            id="settings-scale-select"
            label="Interface text scale"
            options={SCALE_OPTIONS}
            value={scale}
            onChange={(event) => dispatch(setScale(event.target.value as DisplayScale))}
          />
        </section>

        <section className="surface-card stack-md" aria-label="Adaptive device detection">
          <div className="cluster">
            <MonitorSmartphone size={20} aria-hidden="true" />
            <h2>Live Device Profile</h2>
          </div>
          <div className="metric-grid">
            <div className="metric-box">
              <span className="metric-label">Breakpoint</span>
              <span className="metric-value">{device.breakpoint}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Viewport</span>
              <span className="metric-value mono">
                {device.width}×{device.height}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Orientation</span>
              <span className="metric-value">{device.orientation}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">DPR / Aspect</span>
              <span className="metric-value mono">
                {device.pixelRatio}x · {device.aspectRatio}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="surface-card stack-md" aria-label="Backend health">
        <div className="cluster">
          <Activity size={20} aria-hidden="true" />
          <h2 className="flex-1">Backend API Status</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadHealth()}
            loading={healthLoading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Check health
          </Button>
        </div>

        {healthLoading ? (
          <Skeleton variant="line" count={3} />
        ) : healthError ? (
          <div className="alert-banner warning" role="status">
            <span>{healthError}</span>
          </div>
        ) : health ? (
          <div className="metric-grid">
            <div className="metric-box">
              <span className="metric-label">Status</span>
              <div>
                <Badge variant="success">{health.status}</Badge>
              </div>
            </div>
            <div className="metric-box">
              <span className="metric-label">API Version</span>
              <span className="metric-value mono">{health.version}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">ML Backend</span>
              <span className="metric-value mono">{health.ml_backend}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">NLI Model</span>
              <span className="mono text-secondary">{health.nli_model}</span>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
