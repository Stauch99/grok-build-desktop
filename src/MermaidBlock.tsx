import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

type Props = {
  text: string;
  closed: boolean;
  dark: boolean;
};

function ensureMermaid(dark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
  });
}

export function MermaidBlock({ text, closed, dark }: Props) {
  const rawId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!closed || !text.trim()) {
      setSvg(null);
      setError(null);
      return;
    }
    let cancelled = false;
    ensureMermaid(dark);
    const id = `mmd-${rawId}`;
    void mermaid
      .render(id, text)
      .then((out) => {
        if (cancelled) return;
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
