import { getSetting, getSecureSetting } from "@/services/db/settings";
import { getLocale } from "@/i18n";
import { getActiveProviderName } from "./providerManager";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { normalizeLocalBaseUrl, localApiKey } from "./localOpenAi";

/**
 * Voice dictation into the composer.
 *
 * Captures microphone audio with the MediaRecorder API (available in the
 * Tauri WebView on every platform) and transcribes it through the *active
 * provider's* OpenAI-compatible `audio/transcriptions` endpoint:
 *
 * - openai  → api.openai.com (whisper-1 or a `dictation_model` override)
 * - custom  → any OpenAI-compatible gateway (Azure, Groq, vLLM, ...)
 * - ollama  → a local server; point a gateway at it to run faster-whisper
 *             locally (model name comes from `dictation_model`)
 *
 * The custom/ollama legs go through the Tauri HTTP plugin so non-CORS local
 * gateways still work from the webview. Claude/Gemini/Copilot/Bedrock expose
 * no OpenAI-compatible audio endpoint, so dictation reports VOICE_PROVIDER.
 */

export type DictationState = "idle" | "recording" | "transcribing" | "failed";

export interface DictationController {
  state: () => DictationState;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  cancel: () => void;
}

const DICTATION_MODEL_DEFAULT = "whisper-1";

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

interface DictationEndpoint {
  baseURL?: string;
  apiKey: string;
  model: string;
  useTauriFetch?: boolean;
}

/**
 * Resolve the OpenAI-compatible endpoint + model for dictation from the
 * active AI provider configuration. Throws VOICE_NO_KEY when the provider's
 * key/URL is missing and VOICE_PROVIDER when the provider has no
 * OpenAI-compatible audio endpoint.
 */
export async function resolveDictationEndpoint(): Promise<DictationEndpoint> {
  const provider = await getActiveProviderName();
  const model =
    (await getSetting("dictation_model")) || DICTATION_MODEL_DEFAULT;

  if (provider === "openai") {
    const apiKey = await getSecureSetting("openai_api_key");
    if (!apiKey) throw new Error("VOICE_NO_KEY");
    return { apiKey, model };
  }

  if (provider === "custom") {
    const apiKey = await getSecureSetting("custom_api_key");
    const baseUrl = await getSetting("custom_base_url");
    if (!apiKey || !baseUrl) throw new Error("VOICE_NO_KEY");
    return {
      baseURL: baseUrl.trim().replace(/\/+$/, ""),
      apiKey,
      model,
      useTauriFetch: true,
    };
  }

  if (provider === "ollama") {
    const serverUrl =
      (await getSetting("ollama_server_url")) || "http://localhost:11434";
    const apiKey = await getSecureSetting("ollama_api_key");
    return {
      baseURL: normalizeLocalBaseUrl(serverUrl),
      apiKey: localApiKey(apiKey),
      model,
      useTauriFetch: true,
    };
  }

  // Claude / Gemini / Copilot / Bedrock have no OpenAI-compatible
  // /audio/transcriptions endpoint.
  throw new Error("VOICE_PROVIDER");
}

/** Transcribe an audio blob via the active provider's transcriptions endpoint. */
async function transcribe(blob: Blob): Promise<string> {
  const endpoint = await resolveDictationEndpoint();
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: endpoint.apiKey,
    baseURL: endpoint.baseURL,
    dangerouslyAllowBrowser: true,
    ...(endpoint.useTauriFetch ? { fetch: tauriFetch } : {}),
  });
  const file = new File([blob], "dictation.webm", { type: blob.type });
  const response = await client.audio.transcriptions.create({
    file,
    model: endpoint.model,
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