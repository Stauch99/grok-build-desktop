import { useEffect, useId, useState } from "react";
import { getMermaidSvg, loadMermaid, setMermaidSvg } from "../lib/mermaid-once";
import { useT } from "../lib/locale-context";
import { sanitizeSvg } from "../lib/text";

type Props = {
  text: string;
  closed: boolean;
  dark: boolean;
};

export default function MermaidBlock({ text, closed, dark }: Props) {
  const t = useT();
  const rawId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(() =>
    closed ? (getMermaidSvg(text, dark) ?? null) : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!closed || !text.trim()) {
      setSvg(null);
      setError(null);
      return;
    }
    const hit = getMermaidSvg(text, dark);
    if (hit) {
      setSvg(hit);
      setError(null);
      return;
    }
    let cancelled = false;
    void loadMermaid()
      .then((mod) => {
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
        });
        return mermaid.render(`mmd-${rawId}`, text);
      })
      .then((out) => {
        if (cancelled) return;
        const clean = sanitizeSvg(out.svg);
        setMermaidSvg(text, dark, clean);
        setError(null);
        setSvg(clean);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSvg(null);
        setError(e instanceof Error ? e.message : t("mermaid.fail"));
      });
    return () => {
      cancelled = true;
    };
  }, [text, closed, dark, rawId, t]);

  if (!closed || error || !svg) {
    return (
      <div className="mermaid-fallback">
        {error ? <p className="mermaid-error">{error}</p> : null}
        <pre>
          <code>{text}</code>
        </pre>
      </div>
    );
  }

  return <div className="mermaid-view" dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }} />;
}
