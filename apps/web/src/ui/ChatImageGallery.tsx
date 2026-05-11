import { useEffect, useState } from "react";
import type { ChatMessageImage } from "../api";

export interface ChatImageGalleryProps {
  images: ReadonlyArray<ChatMessageImage>;
  messageId: string;
}

export function ChatImageGallery({ images, messageId }: ChatImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }
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

  if (images.length === 0) {
    return null;
  }

  const active = activeIndex !== null ? images[activeIndex] : null;

  return (
    <div className="chat-image-gallery" role="group" aria-label="Image attachments">
      {images.map((image, index) => (
        <button
          type="button"
          key={`${messageId}-image-${index}`}
          className="chat-image-card"
          onClick={() => setActiveIndex(index)}
          aria-label={`Enlarge image ${image.filename ?? image.alt}`}
        >
          <img src={image.src} alt={image.alt} loading="lazy" />
          <span className="chat-image-card-meta">
            <strong>{image.filename ?? image.alt}</strong>
            {image.capturedAt ? <span>Captured: {image.capturedAt}</span> : null}
            {image.source ? <span>Source: {image.source}</span> : null}
          </span>
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
