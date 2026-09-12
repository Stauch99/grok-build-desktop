import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { crashReportText } from "../lib/crash-report";
import { fallbackCopy, t, type Locale } from "../lib/i18n";

type Props = {
  children: ReactNode;
  locale?: Locale;
};

type State = {
  error: Error | null;
  stack: string;
  generation: number;
  copyState: "idle" | "copied" | "failed";
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: "", generation: 0, copyState: "idle" };

  private copyTimer = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, copyState: "idle" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ stack: info.componentStack ?? "" });
  }

  componentWillUnmount() {
    window.clearTimeout(this.copyTimer);
  }

  private copyDiagnostics(report: string) {
    void navigator.clipboard.writeText(report).then(
      () => this.flashCopyState("copied"),
      () => this.flashCopyState("failed"),
    );
  }

  private flashCopyState(copyState: "copied" | "failed") {
    window.clearTimeout(this.copyTimer);
    this.setState({ copyState });
    this.copyTimer = window.setTimeout(() => this.setState({ copyState: "idle" }), 1200);
  }

  render() {
    if (!this.state.error) {
      return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
    }
    const loc = this.props.locale ?? "zh";
    const copy = fallbackCopy(loc);
    const report = crashReportText(this.state.error, this.state.stack);
    const copyLabel =
      this.state.copyState === "copied"
        ? t(loc, "toast.copied")
        : this.state.copyState === "failed"
          ? t(loc, "hub.health.failed")
          : copy.copy;
    return (
      <div className="settings" role="alert">
        <div className="set-card">
          <h3>{copy.title}</h3>
          <div className="set-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                this.setState((s) => ({
                  error: null,
                  stack: "",
                  generation: s.generation + 1,
                  copyState: "idle",
                }))
              }
            >
              {copy.retry}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => this.copyDiagnostics(report)}
            >
              {copyLabel}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => window.location.reload()}
            >
              {t(loc, "common.refresh")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
