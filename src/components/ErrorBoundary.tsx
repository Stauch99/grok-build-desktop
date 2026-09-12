import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { crashReportText } from "../lib/crash-report";
import { fallbackCopy, type Locale } from "../lib/i18n";

type Props = {
  children: ReactNode;
  locale?: Locale;
};

type State = {
  error: Error | null;
  stack: string;
  generation: number;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: "", generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ stack: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
    }
    const copy = fallbackCopy(this.props.locale ?? "zh");
    const report = crashReportText(this.state.error, this.state.stack);
    return (
      <div className="settings" role="alert">
        <div className="set-card">
          <h3>{copy.title}</h3>
          <div className="set-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                this.setState((s) => ({ error: null, stack: "", generation: s.generation + 1 }))
              }
            >
              {copy.retry}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => void navigator.clipboard.writeText(report)}
            >
              {copy.copy}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
