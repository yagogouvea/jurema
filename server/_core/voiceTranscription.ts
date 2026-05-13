/**
 * Voice transcription helper using internal Speech-to-Text service
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Upload audio to storage (e.g., S3) to get URL
 * 3. Call transcription with the URL
 * 
 * Example usage:
 * ```tsx
 * // Frontend component
 * const transcribeMutation = trpc.voice.transcribe.useMutation({
 *   onSuccess: (data) => {
 *     console.log(data.text); // Full transcription
 *     console.log(data.language); // Detected language
 *     console.log(data.segments); // Timestamped segments
 *   }
 * });
 * 
 * // After uploading audio to storage
 * transcribeMutation.mutate({
 *   audioUrl: uploadedAudioUrl,
 *   language: 'en', // optional
 *   prompt: 'Transcribe the meeting' // optional
 * });
 * ```
 */
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string; // Optional: custom prompt for the transcription
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse; // Return native Whisper API response directly

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

export type TranscribeBufferOptions = {
  audioBuffer: Buffer;
  mimeType?: string;
  language?: string;
  prompt?: string;
};

type AudioKind = "ogg" | "mp3" | "wav" | "m4a" | "webm" | "flac";

/**
 * Detecta o formato real do áudio pelos primeiros bytes (magic numbers).
 * Mais confiável que o mime do wa-bridge, que vem como `audio/ogg; codecs=opus`
 * e quebra a lookup de extensão.
 */
function detectAudioKindFromBuffer(buf: Buffer): AudioKind | null {
  if (buf.length < 12) return null;
  // OGG: "OggS"
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return "ogg";
  // RIFF .... WAVE
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) return "wav";
  // ID3 tag (MP3)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return "mp3";
  // MP3 frame sync
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  // ISO Base Media (mp4/m4a): bytes 4..7 = "ftyp"
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "m4a";
  // EBML (webm): 0x1A 0x45 0xDF 0xA3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  // FLAC: "fLaC"
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) return "flac";
  return null;
}

function normalizeAudioMime(mime: string | undefined | null): string {
  if (!mime) return "audio/ogg";
  return String(mime).split(";")[0].trim().toLowerCase() || "audio/ogg";
}

function audioKindFromMime(mime: string): AudioKind | null {
  const m = normalizeAudioMime(mime);
  if (m === "audio/ogg" || m === "audio/oga" || m === "audio/opus") return "ogg";
  if (m === "audio/mpeg" || m === "audio/mp3" || m === "audio/mpga") return "mp3";
  if (m === "audio/wav" || m === "audio/wave" || m === "audio/x-wav") return "wav";
  if (m === "audio/mp4" || m === "audio/m4a" || m === "audio/x-m4a") return "m4a";
  if (m === "audio/webm") return "webm";
  if (m === "audio/flac" || m === "audio/x-flac") return "flac";
  return null;
}

function whisperFilenameFromKind(kind: AudioKind): string {
  switch (kind) {
    case "ogg":
      return "audio.ogg";
    case "mp3":
      return "audio.mp3";
    case "wav":
      return "audio.wav";
    case "m4a":
      return "audio.m4a";
    case "webm":
      return "audio.webm";
    case "flac":
      return "audio.flac";
  }
}

function whisperMimeFromKind(kind: AudioKind): string {
  switch (kind) {
    case "ogg":
      return "audio/ogg";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "webm":
      return "audio/webm";
    case "flac":
      return "audio/flac";
  }
}

/**
 * Transcribe a raw audio Buffer (no URL needed — usado quando os bytes já estão no servidor).
 */
export async function transcribeAudioBuffer(
  options: TranscribeBufferOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    const isPlaceholder = (v: string) => !v || v.trim().length === 0 || v.trim().startsWith("<");
    const useOpenAI = !isPlaceholder(ENV.openaiApiKey);
    const apiBaseUrl = useOpenAI
      ? (ENV.openaiBaseUrl || "https://api.openai.com")
      : ENV.forgeApiUrl;
    const apiKey = useOpenAI ? ENV.openaiApiKey : ENV.forgeApiKey;

    if (!apiBaseUrl || !apiKey) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "OPENAI_API_KEY ou BUILT_IN_FORGE_API_URL/KEY ausentes",
      };
    }

    const buf = options.audioBuffer;
    const sizeMB = buf.length / (1024 * 1024);
    if (sizeMB > 24) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
        details: `File size is ${sizeMB.toFixed(2)}MB`,
      };
    }

    // Prioridade: detecção pelos bytes > mime informado > fallback "ogg" (WhatsApp).
    const detected = detectAudioKindFromBuffer(buf);
    const fromMime = audioKindFromMime(options.mimeType ?? "");
    const kind: AudioKind = detected ?? fromMime ?? "ogg";
    const filename = whisperFilenameFromKind(kind);
    const blobMime = whisperMimeFromKind(kind);
    console.log(
      `[whisper] enviando bytes=${buf.length} mimeInput=${options.mimeType ?? "(none)"} detected=${detected ?? "?"} fromMime=${fromMime ?? "?"} -> ${filename}`
    );

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(buf)], { type: blobMime }), filename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    if (options.language) formData.append("language", options.language);
    const prompt = options.prompt
      || (options.language
        ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
        : "Transcribe the user's voice to text. Idioma padrão: pt-BR.");
    formData.append("prompt", prompt);

    const baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
    const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[whisper] ${response.status} ${response.statusText} filename=${filename} bytes=${buf.length}: ${errorText.slice(0, 300)}`
      );
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText.slice(0, 200)}` : ""}`,
      };
    }

    const whisperResponse = (await response.json()) as WhisperResponse;
    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Whisper retornou resposta inválida",
      };
    }
    return whisperResponse;
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Transcribe audio to text using the internal Speech-to-Text service
 * 
 * @param options - Audio data and metadata
 * @returns Transcription result or error
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // Step 1: Provider — prefere OPENAI_API_KEY (OpenAI Whisper direto),
    // cai para o forge da Manus se OpenAI não estiver configurado.
    const isPlaceholder = (v: string) => !v || v.trim().length === 0 || v.trim().startsWith("<");
    const useOpenAI = !isPlaceholder(ENV.openaiApiKey);
    const apiBaseUrl = useOpenAI
      ? (ENV.openaiBaseUrl || "https://api.openai.com")
      : ENV.forgeApiUrl;
    const apiKey = useOpenAI ? ENV.openaiApiKey : ENV.forgeApiKey;

    if (!apiBaseUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "OPENAI_API_KEY ou BUILT_IN_FORGE_API_URL devem estar configurados"
      };
    }
    if (!apiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "OPENAI_API_KEY ou BUILT_IN_FORGE_API_KEY ausentes"
      };
    }

    // Step 2: Download audio from URL
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const response = await fetch(options.audioUrl);
      if (!response.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response.status}: ${response.statusText}`
        };
      }
      
      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get('content-type') || 'audio/mpeg';
      
      // Check file size (16MB limit)
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      };
    }

    // Step 3: Create FormData for multipart upload to Whisper API
    const formData = new FormData();
    
    // Create a Blob from the buffer and append to form
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    
    // Add prompt - use custom prompt if provided, otherwise generate based on language
    const prompt = options.prompt || (
      options.language 
        ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
        : "Transcribe the user's voice to text"
    );
    formData.append("prompt", prompt);

    // Step 4: Call the transcription service
    const baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;

    const fullUrl = new URL(
      "v1/audio/transcriptions",
      baseUrl
    ).toString();

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
      };
    }

    // Step 5: Parse and return the transcription result
    const whisperResponse = await response.json() as WhisperResponse;
    
    // Validate response structure
    if (!whisperResponse.text || typeof whisperResponse.text !== 'string') {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }

    return whisperResponse; // Return native Whisper API response directly

  } catch (error) {
    // Handle unexpected errors
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}

/**
 * Helper function to get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
  };
  
  return mimeToExt[mimeType] || 'audio';
}

/**
 * Helper function to get full language name from ISO code
 */
function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
  };
  
  return langMap[langCode] || langCode;
}

/**
 * Example tRPC procedure implementation:
 * 
 * ```ts
 * // In server/routers.ts
 * import { transcribeAudio } from "./_core/voiceTranscription";
 * 
 * export const voiceRouter = router({
 *   transcribe: protectedProcedure
 *     .input(z.object({
 *       audioUrl: z.string(),
 *       language: z.string().optional(),
 *       prompt: z.string().optional(),
 *     }))
 *     .mutation(async ({ input, ctx }) => {
 *       const result = await transcribeAudio(input);
 *       
 *       // Check if it's an error
 *       if ('error' in result) {
 *         throw new TRPCError({
 *           code: 'BAD_REQUEST',
 *           message: result.error,
 *           cause: result,
 *         });
 *       }
 *       
 *       // Optionally save transcription to database
 *       await db.insert(transcriptions).values({
 *         userId: ctx.user.id,
 *         text: result.text,
 *         duration: result.duration,
 *         language: result.language,
 *         audioUrl: input.audioUrl,
 *         createdAt: new Date(),
 *       });
 *       
 *       return result;
 *     }),
 * });
 * ```
 */
