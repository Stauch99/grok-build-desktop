import { convertFileSrc } from "@tauri-apps/api/core";
import { basename } from "../lib/text";

export type ImagineGalleryProps = {
  images: string[];
  videos: string[];
  onOpen: (path: string) => void;
  onSlash: (cmd: string) => void;
  mode?: "image" | "video";
};

/**
 * Local /imagine artifacts. Generation stays on the slash — this is not a
 * second media studio.
 */
export function ImagineGallery({ images, videos, onOpen, onSlash, mode }: ImagineGalleryProps) {
  const showVideo = mode === "video";
  const paths = showVideo ? videos : images;
  const empty = paths.length === 0;

  return (
    <div>
      <div className="set-actions">
        <button type="button" className="btn ghost" onClick={() => onSlash(showVideo ? "/imagine-video" : "/imagine")}>
          {showVideo ? "/imagine-video" : "/imagine"}
        </button>
      </div>
      {empty ? (
        <p className="float-empty">
          {showVideo ? "还没有视频。点 /imagine-video 生成。" : "还没有图片。点 /imagine 生成。"}
        </p>
      ) : null}
      {showVideo ? (
        <div className="gallery-grid">
          {paths.map((path) => (
            <button key={path} type="button" title={path} onClick={() => onOpen(path)}>
              <video src={convertFileSrc(path)} muted preload="metadata" playsInline />
            </button>
          ))}
        </div>
      ) : (
        <div className="gallery-grid">
          {paths.map((path) => (
            <button key={path} type="button" title={path} onClick={() => onOpen(path)}>
              <img src={convertFileSrc(path)} alt={basename(path)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
