import { Component, type ErrorInfo, type ReactNode } from "react";
import { fallbackCopy, type Locale } from "../lib/i18n";

type Props = {
  children: ReactNode;
  locale?: Locale;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const copy = fallbackCopy(this.props.locale ?? "zh");
    return (
      <div className="settings" role="alert">
        <div className="set-card">
          <h3>{copy.title}</h3>
          <div className="set-actions">
            <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
              {copy.retry}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
