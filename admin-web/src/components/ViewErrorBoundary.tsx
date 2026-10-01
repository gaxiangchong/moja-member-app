import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Changing this (e.g. the open view) clears a previous error. */
  resetKey?: string;
};

type State = { error: Error | null };

/**
 * Keeps one screen's failure from taking the whole admin down. Without it, an
 * error while drawing a view leaves a blank white page; with it, the rest of the
 * admin keeps working and the person sees what happened and can carry on.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin view crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel">
        <h2 className="panelTitle">This screen hit a problem</h2>
        <p className="dataTableMuted">
          Your last change may well have been saved. Reload the screen to see its current state. If it keeps
          happening, tell us what you clicked just before this appeared.
        </p>
        <p className="viewError">{this.state.error.message}</p>
        <button type="button" className="toolbarButton toolbarButton--primary" onClick={() => window.location.reload()}>
          Reload screen
        </button>
      </section>
    );
  }
}
