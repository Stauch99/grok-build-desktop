import { useState } from "react";
import { AgentIcon } from "../lib/agent-icons";
import type { DevinAuthStatus } from "../lib/devin-auth";
import { t, type Locale } from "../lib/i18n";
import { useLocale } from "../lib/locale-context";

export type DevinAuthCardProps = {
  status: DevinAuthStatus;
  error?: string | null;
  locale?: Locale;
  onAuthenticate: (opts: { apiKey?: string; remember?: boolean }) => void;
  onDismiss: () => void;
};

/**
 * Devin's ACP host ignores CLI credentials — the account must be authorized per
 * process via `authenticate` (browser PKCE or a Devin API key validated
 * server-side). Rendered over the thread while a flow is needed or in flight.
 */
export function DevinAuthCard({ status, error, locale, onAuthenticate, onDismiss }: DevinAuthCardProps) {
  const ctxLocale = useLocale();
  const loc = locale ?? ctxLocale;
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState<"browser" | "key" | null>(null);
  const busy = status === "busy";

  const submitBrowser = () => {
    if (busy) return;
    setPending("browser");
    onAuthenticate({});
  };
  const submitKey = () => {
    const key = apiKey.trim();
    if (!key || busy) return;
    setPending("key");
    onAuthenticate({ apiKey: key, remember });
  };

  const statusText =
    status === "failed"
      ? error ?? t(loc, "devin.auth.failed")
      : busy && pending !== "key"
        ? t(loc, "devin.auth.waiting")
        : "";

  return (
    <div className="devin-auth-card" role="group" aria-label={t(loc, "devin.auth.title")}>
      <div className="devin-auth-head">
        <AgentIcon id="devin" size={20} className="devin-auth-icon" />
        <h3>{t(loc, "devin.auth.title")}</h3>
      </div>
      <p className="devin-auth-desc">{t(loc, "devin.auth.desc")}</p>
      <button type="button" className="btn primary" disabled={busy} onClick={submitBrowser}>
        {t(loc, "devin.auth.browser")}
      </button>
      <div className="devin-auth-keyrow">
        <input
          type="password"
          value={apiKey}
          placeholder={t(loc, "devin.auth.keyPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitKey();
            }
          }}
        />
        <button type="button" className="btn" disabled={busy || !apiKey.trim()} onClick={submitKey}>
          {t(loc, "devin.auth.keySubmit")}
        </button>
      </div>
      <label className="devin-auth-remember">
        <input
          type="checkbox"
          checked={remember}
          disabled={busy}
          onChange={(e) => setRemember(e.target.checked)}
        />
        {t(loc, "devin.auth.remember")}
      </label>
      <p className="devin-auth-hint">{t(loc, "devin.auth.whereKey")}</p>
      <p className={`devin-auth-status${status === "failed" ? " is-error" : ""}`} aria-live="polite">
        {statusText}
      </p>
      <button type="button" className="btn ghost devin-auth-dismiss" onClick={onDismiss}>
        {t(loc, "devin.auth.dismiss")}
      </button>
    </div>
  );
}
