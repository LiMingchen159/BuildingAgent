import { useState } from "react";
import type { RepositoryDownloadLink } from "../repositoryLinks";

interface ChatFileDownloadsProps {
  files: RepositoryDownloadLink[];
  resolveDownloadUrl: (path: string) => string;
}

export function ChatFileDownloads({ files, resolveDownloadUrl }: ChatFileDownloadsProps) {
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(file: RepositoryDownloadLink) {
    setBusyPath(file.path);
    setError(null);
    try {
      const response = await fetch(resolveDownloadUrl(file.path));
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.filename;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed");
    } finally {
      setBusyPath(null);
    }
  }

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="chat-file-downloads">
      <p className="chat-file-downloads-title">Generated files</p>
      <ul className="chat-file-downloads-list">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              className="chat-file-downloads-link"
              disabled={busyPath === file.path}
              onClick={() => void handleDownload(file)}
            >
              {busyPath === file.path ? "Downloading…" : file.filename}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="chat-file-downloads-error">{error}</p> : null}
    </div>
  );
}
