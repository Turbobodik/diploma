import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logger } from '../../services/logger';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('React ErrorBoundary caught an unhandled error', {
      message: error.message,
      componentStack: info.componentStack ?? '',
    });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="app-content" role="alert">
          <div className="surface-card stack-md">
            <div className="cluster">
              <AlertTriangle size={22} aria-hidden="true" />
              <h1>Something went wrong</h1>
            </div>
            <p className="text-secondary">{this.state.message}</p>
            <div className="cluster">
              <Button variant="primary" onClick={this.handleReset}>
                <RotateCcw size={16} aria-hidden="true" />
                Try again
              </Button>
              <Button variant="secondary" onClick={() => window.location.assign('/projects')}>
                Back to projects
              </Button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
