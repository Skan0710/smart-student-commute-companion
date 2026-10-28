import React from 'react';
import { ErrorState } from './ui';

/**
 * ErrorBoundary - keeps a render error in one screen from blanking the app.
 *
 * Without a boundary, any exception thrown while rendering unmounts the whole
 * React tree (a white page). This catches it, logs it for developers, and shows
 * a recoverable message instead.
 *
 * - Screen mode (default): the header and navigation stay usable. The boundary
 *   clears itself when `resetKey` changes (e.g. the student switches tabs) and
 *   offers "Try again" plus an optional "Go to dashboard" (`onHome`).
 * - `fullPage` mode: wraps the whole app and offers a reload.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {*} [props.resetKey] - Changing this value clears a previous error
 * @param {Function} [props.onHome] - Adds a "Go to dashboard" action
 * @param {boolean} [props.fullPage=false]
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] A screen failed to render:', error, info?.componentStack);
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { onHome, fullPage = false } = this.props;
    return (
      <div className={fullPage ? 'min-h-screen flex items-center justify-center p-6' : 'py-6'}>
        <ErrorState
          headingLevel={2}
          title="This screen hit a problem"
          message="Something went wrong while showing this screen. Your data is safe — try again, or head back to the dashboard."
          retryLabel={fullPage ? 'Reload the app' : 'Try again'}
          onRetry={fullPage ? () => window.location.reload() : () => this.setState({ error: null })}
          customAction={
            onHome && !fullPage ? (
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  onHome();
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Go to dashboard
              </button>
            ) : null
          }
        />
      </div>
    );
  }
}
