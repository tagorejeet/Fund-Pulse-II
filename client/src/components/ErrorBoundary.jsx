import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('FundPulse React ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHardReset = () => {
    try {
      // Clear non-critical transient keys while preserving custom fund lists if possible
      sessionStorage.clear();
    } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#061024] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6 transition-colors">
          <div className="max-w-lg w-full bg-white dark:bg-[#0B1936] border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold font-serif text-slate-900 dark:text-white">Something went wrong</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Snazzy Wealth FundLens encountered an unexpected interface issue. Your saved funds and custom configurations are safe.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-50 dark:bg-slate-950/80 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono text-rose-600 dark:text-rose-400 text-left overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-snazzy-navy hover:bg-[#0A295F] text-white dark:bg-snazzy-gold dark:hover:bg-[#dba83a] dark:text-snazzy-navy font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Application
              </button>

              <button
                onClick={this.handleHardReset}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Refresh State
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
