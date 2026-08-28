import { useEffect, useId, useState } from "react";
import { getMermaidSvg, loadMermaid, setMermaidSvg } from "../lib/mermaid-once";

type Props = {
  text: string;
  closed: boolean;
  dark: boolean;
};

export default function MermaidBlock({ text, closed, dark }: Props) {
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
        setMermaidSvg(text, dark, out.svg);
        setError(null);
        setSvg(out.svg);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSvg(null);
        setError(e instanceof Error ? e.message : "无法绘制这张图");
      });
    return () => {
      cancelled = true;
    };
  }, [text, closed, dark, rawId]);

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

  return <div className="mermaid-view" dangerouslySetInnerHTML={{ __html: svg }} />;
}
