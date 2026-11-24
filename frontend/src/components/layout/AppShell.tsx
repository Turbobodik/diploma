import {
  AlertCircle,
  BookOpen,
  FolderKanban,
  LogOut,
  Moon,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { logout } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setGlobalError, toggleTheme } from '../../store/uiSlice';
import { Button } from '../common/Button';

const SIDEBAR_STORAGE_KEY = 'factmap_sidebar_collapsed';

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const user = useAppSelector((state) => state.auth.user);
  const theme = useAppSelector((state) => state.ui.theme);
  const globalError = useAppSelector((state) => state.ui.globalError);
  const activeProjectId = useAppSelector((state) => state.workspace.projectId);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors in private browsing
      }
      return next;
    });
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const workspacePath = activeProjectId ? `/projects/${activeProjectId}` : '/projects';

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside
        className="app-sidebar"
        aria-label="Primary navigation"
        aria-hidden={sidebarCollapsed || undefined}
      >
        <NavLink to="/projects" className="brand-mark">
          <span className="brand-icon" aria-hidden="true">
            <BookOpen size={18} />
          </span>
          <div>
            <div className="brand-title">FactMap Scholar</div>
            <div className="brand-subtitle">NLI Evidence Lab</div>
          </div>
        </NavLink>

        <nav className="sidebar-nav" aria-label="Workspace sections">
          <NavLink
            to="/projects"
            end
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <FolderKanban size={18} aria-hidden="true" />
            <span>Projects</span>
          </NavLink>
          {activeProjectId ? (
            <NavLink
              to={workspacePath}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Network size={18} aria-hidden="true" />
              <span>Evidence Map</span>
            </NavLink>
          ) : null}
          <NavLink
            to="/design-system"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Palette size={18} aria-hidden="true" />
            <span>Design System</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Settings size={18} aria-hidden="true" />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {user ? (
            <div className="user-pill">
              <span className="user-pill-name">{user.display_name}</span>
              <span className="user-pill-email">{user.email}</span>
            </div>
          ) : null}
          <Button variant="secondary" size="sm" onClick={handleLogout} id="sidebar-logout-btn">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="app-main-column">
        <header className="app-topbar">
          <div className="cluster">
            <Button
              variant="ghost"
              size="sm"
              className="sidebar-toggle-desktop"
              onClick={handleToggleSidebar}
              aria-label={sidebarCollapsed ? 'Показать боковое меню' : 'Скрыть боковое меню'}
              aria-expanded={!sidebarCollapsed}
              id="sidebar-toggle-btn"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={17} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={17} aria-hidden="true" />
              )}
              <span>{sidebarCollapsed ? 'Меню' : 'Скрыть меню'}</span>
            </Button>

            {sidebarCollapsed ? (
              <NavLink to="/projects" className="brand-mark topbar-brand-collapsed">
                <span className="brand-icon" aria-hidden="true">
                  <BookOpen size={15} />
                </span>
                <span className="brand-title">FactMap Scholar</span>
              </NavLink>
            ) : null}

            <NavLink to="/projects" className="brand-mark topbar-brand-mobile">
              <span className="brand-icon" aria-hidden="true">
                <BookOpen size={16} />
              </span>
              <span className="brand-title">FactMap</span>
            </NavLink>
          </div>

          <div className="topbar-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch(toggleTheme())}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              id="topbar-theme-toggle"
            >
              {theme === 'light' ? (
                <Moon size={16} aria-hidden="true" />
              ) : (
                <Sun size={16} aria-hidden="true" />
              )}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </Button>
          </div>
        </header>

        <main id="main-content" className="app-content">
          {globalError ? (
            <div className="alert-banner error global-error-banner" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <span className="flex-1">{globalError}</span>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Dismiss error banner"
                onClick={() => dispatch(setGlobalError(null))}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <NavLink
          to="/projects"
          end
          className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
        >
          <FolderKanban size={18} aria-hidden="true" />
          <span>Projects</span>
        </NavLink>
        <NavLink
          to={workspacePath}
          className={({ isActive }) =>
            `mobile-nav-link ${activeProjectId && isActive ? 'active' : ''}`
          }
        >
          <Network size={18} aria-hidden="true" />
          <span>Map</span>
        </NavLink>
        <NavLink
          to="/design-system"
          className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
        >
          <Palette size={18} aria-hidden="true" />
          <span>UI Kit</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
        >
          <Settings size={18} aria-hidden="true" />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
