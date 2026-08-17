import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-8 bg-[#0b1326] text-on-surface">
          <div className="max-w-md w-full glass-panel p-8 rounded-2xl border border-error/30 flex flex-col items-center text-center gap-4 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-error/20 flex items-center justify-center text-error border border-error/30">
              <span className="material-symbols-outlined text-3xl">error</span>
            </div>
            <h2 className="text-xl font-bold text-on-surface font-headline-md">Something went wrong</h2>
            <p className="text-xs text-on-surface-variant font-body-rt leading-relaxed">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn-primary-glow px-6 py-2 rounded-lg font-label-caps text-xs flex items-center gap-2 mt-2"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
