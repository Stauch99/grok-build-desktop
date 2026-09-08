import { useEffect, useId, useState, type ReactNode } from "react";
import { DEFAULT_ACCENT_ID, normalizeAccentId, type AccentId } from "../lib/accent";
import {
  grokBotEyes,
  grokBotShape,
  grokBotSpec,
  type GrokBotBody,
  type GrokBotEyeRect,
} from "../lib/grok-bot";

const KEY_TIMES = "0;0.1;0.2;0.3;0.4;0.5;0.6;0.7;0.9;1";
const KEY_SPLINES =
  "0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1";

function Motion({
  type,
  values,
  additive,
}: {
  type: "rotate" | "scale" | "translate";
  values: string;
  additive?: "sum";
}) {
  return (
    <animateTransform
      attributeName="transform"
      type={type}
      values={values}
      keyTimes={KEY_TIMES}
      calcMode="spline"
      keySplines={KEY_SPLINES}
      dur="1.6s"
      repeatCount="indefinite"
      additive={additive}
    />
  );
}

function Eye(eye: GrokBotEyeRect) {
  return (
    <g transform={`translate(${eye.cx} ${eye.cy})`}>
      <Motion type="scale" values="1 1;1 1;1 1;1 1;1 0.9;1 0.08;1 0.9;1 1;1 1;1 1" additive="sum" />
      <Motion type="translate" values="0 0;0 -2;0 0;0 2;0 0;0 0;0 0;0 -1;0 0;0 0" additive="sum" />
      <rect x={eye.x} y={eye.y} width={eye.w} height={eye.h} rx={eye.rx} fill="white" />
    </g>
  );
}

function BodyFill({ body }: { body: GrokBotBody }) {
  if (body.kind === "path") return <path fill="currentColor" d={body.d} />;
  if (body.kind === "circle") return <circle fill="currentColor" cx={body.cx} cy={body.cy} r={body.r} />;
  if (body.kind === "pill") {
    return <rect fill="currentColor" x={body.x} y={body.y} width={body.w} height={body.h} rx={body.rx} />;
  }
  return (
    <>
      <ellipse cx="100" cy="42" rx="30" ry="40" fill="currentColor" />
      <ellipse cx="100" cy="158" rx="30" ry="40" fill="currentColor" />
      <ellipse cx="42" cy="100" rx="40" ry="30" fill="currentColor" />
      <ellipse cx="158" cy="100" rx="40" ry="30" fill="currentColor" />
      <circle cx="100" cy="100" r="42" fill="currentColor" />
    </>
  );
}

function BodyClip({ id, body }: { id: string; body: GrokBotBody }) {
  let kids: ReactNode;
  if (body.kind === "path") kids = <path d={body.d} />;
  else if (body.kind === "circle") kids = <circle cx={body.cx} cy={body.cy} r={body.r} />;
  else if (body.kind === "pill") kids = <rect x={body.x} y={body.y} width={body.w} height={body.h} rx={body.rx} />;
  else {
    kids = (
      <>
        <ellipse cx="100" cy="42" rx="30" ry="40" />
        <ellipse cx="100" cy="158" rx="30" ry="40" />
        <ellipse cx="42" cy="100" rx="40" ry="30" />
        <ellipse cx="158" cy="100" rx="40" ry="30" />
        <circle cx="100" cy="100" r="38" />
      </>
    );
  }
  return <clipPath id={id}>{kids}</clipPath>;
}

function useDocumentAccent(override?: AccentId): AccentId {
  const [id, setId] = useState<AccentId>(() => override ?? DEFAULT_ACCENT_ID);
  useEffect(() => {
    if (override) {
      setId(override);
      return;
    }
    const el = document.documentElement;
    const sync = () => setId(normalizeAccentId(el.dataset.accent));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["data-accent"] });
    return () => mo.disconnect();
  }, [override]);
  return override ?? id;
}

/** Animated design-pack robot. Silhouette follows the selected accent; fill follows `currentColor`. */
export function GrokBotIcon({ size = 18, accent }: { size?: number; accent?: AccentId }) {
  const clipId = `grok-bot-clip-${useId().replace(/:/g, "")}`;
  const accentId = useDocumentAccent(accent);
  const spec = grokBotSpec(accentId);
  const eyes = grokBotEyes(grokBotShape(accentId));
  return (
    <svg
      className="grok-bot"
      data-shape={spec.shape}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <BodyClip id={clipId} body={spec.body} />
      </defs>
      <g>
        <Motion type="rotate" values="0 100 100;2 100 100;0 100 100;-2 100 100;0 100 100;-3 100 100;0 100 100;3 100 100;0 100 100;0 100 100" />
        <g>
          <Motion type="scale" values="1 1;1.04 0.96;1 1;0.97 1.03;1 1;0.94 1.06;1 1;1.03 0.97;1 1;1 1" />
          <Motion type="translate" values="0 0;-4 4;0 0;3 -3;0 0;6 -6;0 0;-3 3;0 0;0 0" additive="sum" />
          <BodyFill body={spec.body} />
          <g clipPath={`url(#${clipId})`}>
            <g>
              <Motion type="translate" values="0 0;-5 0;-5 0;0 0;5 0;5 0;0 0;-3 0;0 0;0 0" />
              <Eye {...eyes.left} />
              <Eye {...eyes.right} />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
