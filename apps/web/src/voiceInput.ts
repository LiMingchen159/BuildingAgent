// Voice input utilities for chat composer

export async function startRecording(): Promise<MediaRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  return mediaRecorder;
}

export function stopRecording(mediaRecorder: MediaRecorder): void {
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((track) => track.stop());
}

export async function transcribeAudio(audioBlob: Blob, token: string): Promise<string> {
  const response = await fetch("/api/stt/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": audioBlob.type || "audio/webm",
      Authorization: `Bearer ${token}`
    },
    body: audioBlob
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ code: "stt_failed", message: "Transcription failed" }));
    throw new Error(error.message || "Transcription failed");
  }

  const result = await response.json();
  return result.text || "";
}
