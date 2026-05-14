import { useEffect, useState } from "react";
import type { ChatMessageImage } from "../api";

export interface ChatImageGalleryProps {
  images: ReadonlyArray<ChatMessageImage>;
  messageId: string;
  resolveImageUrl?: (url: string) => string;
}

export function ChatImageGallery({ images, messageId, resolveImageUrl }: ChatImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex === null) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
      } else if (event.key === "ArrowRight") {
        setActiveIndex((current) => (current === null ? null : Math.min(images.length - 1, current + 1)));
      } else if (event.key === "ArrowLeft") {
        setActiveIndex((current) => (current === null ? null : Math.max(0, current - 1)));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, images.length]);

  if (images.length === 0) return null;

  const resolvedImages = images.map((image) => ({
    ...image,
    src: resolveImageUrl ? resolveImageUrl(image.src) : image.src
  }));

  const active = activeIndex !== null ? resolvedImages[activeIndex] : null;

  return (
    <div className="chat-image-gallery" role="group" aria-label="Image attachments">
      {resolvedImages.map((image, index) => (
        <button
          key={`${messageId}-image-${index}`}
          type="button"
          className="chat-image-card"
          onClick={() => setActiveIndex(index)}
          aria-label={`Enlarge image ${image.filename ?? image.alt}`}
        >
          <img src={image.src} alt={image.alt} loading="lazy" />
        </button>
      ))}
      {active ? (
        <div className="chat-image-lightbox" role="dialog" aria-modal="true" aria-label={active.filename ?? active.alt} onClick={() => setActiveIndex(null)}>
          <figure className="chat-image-lightbox-figure" onClick={(event) => event.stopPropagation()}>
            <img src={active.src} alt={active.alt} />
            <figcaption>
              <strong>{active.filename ?? active.alt}</strong>
              {active.capturedAt ? <span> · Captured {active.capturedAt}</span> : null}
              {active.source ? <span> · Source {active.source}</span> : null}
            </figcaption>
            <button type="button" className="chat-image-lightbox-close" onClick={() => setActiveIndex(null)} aria-label="Close image preview">
              Close
            </button>
          </figure>
        </div>
      ) : null}
    </div>
  );
}
