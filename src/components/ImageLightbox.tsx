import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft, IconChevronRight, IconClose } from "../icons";
import { useT } from "../lib/locale-context";

export type LightboxImage = { src: string; name: string };

export type ImageLightboxProps = {
  images: LightboxImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
};

/**
 * Full-screen viewer for images clicked inside a message. Esc / backdrop / X
 * closes; ←/→ or the side arrows step through a multi-image message. Locks
 * body scroll while open; all motion is gated on prefers-reduced-motion.
 */
export function ImageLightbox({ images, index, onIndex, onClose }: ImageLightboxProps) {
  const t = useT();
  const total = images.length;
  const image = images[Math.min(Math.max(index, 0), total - 1)] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (total > 1 && e.key === "ArrowLeft") {
        e.preventDefault();
        onIndex((index - 1 + total) % total);
      } else if (total > 1 && e.key === "ArrowRight") {
        e.preventDefault();
        onIndex((index + 1) % total);
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, total, onIndex, onClose]);

  if (!image) return null;

  const step = (dir: 1 | -1) => onIndex((index + dir + total) % total);

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("thread.imageView")}
      onClick={onClose}
    >
      <button
        type="button"
        className="lightbox-x"
        aria-label={t("common.close")}
        onClick={onClose}
      >
        <IconClose size={18} />
      </button>
      {total > 1 ? (
        <button
          type="button"
          className="lightbox-nav prev"
          aria-label={t("thread.prevImage")}
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
        >
          <IconChevronLeft size={22} />
        </button>
      ) : null}
      <img
        src={image.src}
        alt={image.name}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <div className="lightbox-cap">
        {image.name}
        {total > 1 ? ` · ${index + 1}/${total}` : ""}
      </div>
      {total > 1 ? (
        <button
          type="button"
          className="lightbox-nav next"
          aria-label={t("thread.nextImage")}
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
        >
          <IconChevronRight size={22} />
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
