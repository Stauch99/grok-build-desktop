import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { assetRoots, parentDir, safeFileSrc } from "../lib/asset-src";
import { basename } from "../lib/text";
import { useT } from "../lib/locale-context";
import { IconPhoto, IconPlayerPlay } from "../icons";

export type ImagineGalleryProps = {
  images: string[];
  videos: string[];
  onOpen: (path: string) => void;
  onSlash: (cmd: string) => void;
  mode?: "image" | "video";
  cwd?: string;
  grokHome?: string;
};

function GalleryTile({ path, video, roots, onOpen }: { path: string; video: boolean; roots: string[]; onOpen: (p: string) => void }) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : safeFileSrc(path, roots, convertFileSrc);
  const name = basename(path);
  return (
    <button key={path} type="button" onClick={() => onOpen(path)} aria-label={name}>
      {src ? (
        video ? (
          <video src={src} muted preload="metadata" playsInline onError={() => setBroken(true)} />
        ) : (
          <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} />
        )
      ) : (
        <span className="gallery-fallback" aria-hidden>
          {video ? <IconPlayerPlay size={22} /> : <IconPhoto size={22} />}
        </span>
      )}
      <span className="gallery-cap">{name}</span>
    </button>
  );
}

/**
 * Local /imagine artifacts. Generation stays on the slash — this is not a
 * second media studio.
 */
export function ImagineGallery({
  images,
  videos,
  onOpen,
  onSlash,
  mode,
  cwd = "",
  grokHome = "",
}: ImagineGalleryProps) {
  const t = useT();
  const showVideo = mode === "video";
  const paths = showVideo ? videos : images;
  const empty = paths.length === 0;
  const roots = useMemo(() => {
    // Artifacts can live outside cwd/grok-sessions roots (~/Downloads,
    // ~/.grok/downloads) — allow each returned file's own directory.
    const dirs = new Set(paths.map(parentDir));
    return [...assetRoots(cwd, grokHome), ...dirs];
  }, [cwd, grokHome, paths]);

  return (
    <div>
      <div className="set-actions">
        <button type="button" className="btn ghost" onClick={() => onSlash(showVideo ? "/imagine-video" : "/imagine")}>
          {showVideo ? "/imagine-video" : "/imagine"}
        </button>
      </div>
      {empty ? (
        <p className="float-empty">
          {showVideo ? t("imagine.emptyVideo") : t("imagine.emptyImage")}
        </p>
      ) : null}
      <div className="gallery-grid">
        {paths.map((path) => (
          <GalleryTile key={path} path={path} video={showVideo} roots={roots} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
