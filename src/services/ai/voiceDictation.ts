import { getSecureSetting } from "@/services/db/settings";
import { getLocale } from "@/i18n";

/**
 * Voice dictation into the composer.
 *
 * Captures microphone audio with the MediaRecorder API (available in the
 * Tauri WebView on every platform) and transcribes it through the OpenAI
 * audio transcriptions endpoint with the user's configured OpenAI key.
 * The `openai` SDK is already a dependency; audio never leaves the machine
 * except to the OpenAI API the user explicitly configured.
 */

export type DictationState = "idle" | "recording" | "transcribing" | "failed";

export interface DictationController {
  state: () => DictationState;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  cancel: () => void;
}

const MIME_CANDIDATES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
];

function pickMimeType(): string {
  for (const candidate of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "audio/webm";
}

/** Transcribe an audio blob via the OpenAI transcriptions API. */
async function transcribe(blob: Blob): Promise<string> {
  const apiKey = await getSecureSetting("openai_api_key");
  if (!apiKey) throw new Error("VOICE_NO_KEY");
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const file = new File([blob], "dictation.webm", { type: blob.type });
  const response = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    // Hint the spoken language from the active UI locale — whisper transcribes
    // far more accurately when it knows the language up front.
    language: getLocale(),
  });
  return response.text ?? "";
}

/**
 * Create a dictation controller bound to the current page. One instance per
 * composer — `start()` begins capture, `stop()` transcribes and returns the
 * text (empty string when nothing was spoken).
 */
export function createDictationController(): DictationController {
  let recorder: MediaRecorder | null = null;
  let chunks: BlobPart[] = [];
  let stream: MediaStream | null = null;
  let currentState: DictationState = "idle";
  let stopResolve: ((text: string) => void) | null = null;

  const setState = (state: DictationState) => {
    currentState = state;
  };

  return {
    state: () => currentState,
    start: async () => {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState("failed");
        throw new Error("VOICE_UNSUPPORTED");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
      };
      recorder.start();
      setState("recording");
    },
    stop: () =>
      new Promise<string>((resolve, reject) => {
        if (!recorder || recorder.state === "inactive") {
          reject(new Error("VOICE_NOT_RECORDING"));
          return;
        }
        stopResolve = resolve;
        recorder.onstop = async () => {
          stream?.getTracks().forEach((track) => track.stop());
          stream = null;
          const blob = new Blob(chunks, { type: pickMimeType() });
          try {
            setState("transcribing");
            const text = await transcribe(blob);
            setState("idle");
            stopResolve?.(text);
            stopResolve = null;
          } catch (err) {
            setState("failed");
            stopResolve?.(null as unknown as string);
            stopResolve = null;
            reject(err);
          }
        };
        recorder.stop();
      }),
    cancel: () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // already stopped
        }
      }
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      chunks = [];
      setState("idle");
    },
  };
}