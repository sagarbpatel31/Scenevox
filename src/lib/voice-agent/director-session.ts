const AGENT_WEBSOCKET_URL = "wss://agents.assemblyai.com/v1/ws";
const VOICE_SAMPLE_RATE = 24_000;

export type DirectorState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ending"
  | "error";

export type DirectorLineContext = {
  lineId: string;
  lineNumber: number;
  characterName: string;
  text: string;
  direction: string;
};

export type DirectorRevision = {
  text: string;
  direction: string;
};

type DirectorCallbacks = {
  onState: (state: DirectorState) => void;
  onTranscript: (speaker: "user" | "agent", text: string) => void;
  onRevision: (revision: DirectorRevision) => void;
  onSession: (sessionId: string) => void;
  onError: (message: string) => void;
};

type AgentEvent = {
  type: string;
  session_id?: string;
  text?: string;
  delta?: string;
  data?: string;
  status?: "completed" | "interrupted";
  code?: string;
  message?: string;
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

type PendingToolCall = {
  callId: string;
  revision?: DirectorRevision;
  error?: string;
};

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function directorPrompt(context: DirectorLineContext) {
  return `You are SceneVox Director, a concise creative director for scripted voice performance.

Help screenwriters, game writers, and audio-fiction creators improve one selected line at a time. Focus on intention, subtext, pacing, and emotional delivery. Keep every spoken response under two sentences. Ask at most one brief clarifying question. Never add generic praise or long explanations.

The currently selected line is line ${context.lineNumber}, spoken by ${context.characterName}.
Current dialogue: "${context.text}"
Current performance direction: "${context.direction}"

When the writer clearly asks to revise the dialogue or its delivery, call revise_selected_line with the complete replacement dialogue and a short performance direction. Do not claim the line changed unless you call the tool. Do not rewrite the entire scene unless explicitly asked.`;
}

export class DirectorSession {
  private websocket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private playbackSources = new Set<AudioBufferSourceNode>();
  private playbackTime = 0;
  private pendingTools: PendingToolCall[] = [];
  private ready = false;
  private closing = false;
  private cleanedUp = false;
  private endFallback: ReturnType<typeof setTimeout> | null = null;
  private agentTranscript = "";

  constructor(private readonly callbacks: DirectorCallbacks) {}

  async connect(context: DirectorLineContext) {
    this.callbacks.onState("connecting");
    this.callbacks.onError("");

    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      await this.audioContext.audioWorklet.addModule("/pcm-processor.js");

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const tokenResponse = await fetch("/api/voice-agent/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const tokenPayload = (await tokenResponse.json()) as { token?: string; error?: string };
      if (!tokenResponse.ok || !tokenPayload.token) {
        throw new Error(tokenPayload.error ?? "Could not start an AssemblyAI session.");
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, "scenevox-pcm-processor", {
        processorOptions: {
          inputSampleRate: this.audioContext.sampleRate,
          targetSampleRate: VOICE_SAMPLE_RATE,
        },
      });
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;
      this.sourceNode.connect(this.workletNode).connect(this.silentGain).connect(this.audioContext.destination);

      const websocketUrl = new URL(AGENT_WEBSOCKET_URL);
      websocketUrl.searchParams.set("token", tokenPayload.token);
      this.websocket = new WebSocket(websocketUrl);

      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (!this.ready || this.websocket?.readyState !== WebSocket.OPEN) return;
        this.websocket.send(
          JSON.stringify({ type: "input.audio", audio: bufferToBase64(event.data) }),
        );
      };

      this.websocket.addEventListener("open", () => {
        this.websocket?.send(
          JSON.stringify({
            type: "session.update",
            session: {
              system_prompt: directorPrompt(context),
              greeting: `I'm in the booth with line ${context.lineNumber}. Tell me what you want ${context.characterName} to feel.`,
              input: {
                format: { encoding: "audio/pcm" },
                keyterms: ["SceneVox", "Mara Venn", "Orion"],
                transcription_mode: "balanced",
                transcription_prompt: "Expect character names, acting direction, and screenplay terminology.",
                language_codes: ["en"],
                voice_focus: "near-field",
              },
              output: {
                voice: "winter",
                format: { encoding: "audio/pcm" },
              },
              tools: [
                {
                  type: "function",
                  name: "revise_selected_line",
                  description:
                    "Replace the selected SceneVox line and its performance direction after the writer clearly requests a change.",
                  parameters: {
                    type: "object",
                    properties: {
                      text: {
                        type: "string",
                        description: "The complete replacement dialogue, without quotation marks.",
                      },
                      direction: {
                        type: "string",
                        description: "A concise playable acting direction, ideally two to six words.",
                      },
                    },
                    required: ["text", "direction"],
                  },
                },
              ],
            },
          }),
        );
      });

      this.websocket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as AgentEvent;
        this.handleEvent(message);
      });

      this.websocket.addEventListener("error", () => {
        this.fail("The live voice connection encountered a network error.");
      });

      this.websocket.addEventListener("close", () => {
        if (!this.cleanedUp) {
          if (!this.closing) {
            this.callbacks.onError("The live voice connection closed unexpectedly.");
            this.callbacks.onState("error");
          }
          this.cleanup();
        }
      });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Could not start the voice director.");
    }
  }

  end() {
    if (this.closing || this.cleanedUp) return;
    this.closing = true;
    this.callbacks.onState("ending");

    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: "session.end" }));
      this.endFallback = setTimeout(() => this.cleanup(), 1_500);
      return;
    }

    this.cleanup();
  }

  dispose() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: "session.end" }));
    }
    this.cleanup(false);
  }

  private handleEvent(message: AgentEvent) {
    switch (message.type) {
      case "session.ready":
        this.ready = true;
        this.playbackTime = this.audioContext?.currentTime ?? 0;
        if (message.session_id) this.callbacks.onSession(message.session_id);
        this.callbacks.onState("listening");
        break;
      case "input.speech.started":
        this.flushPlayback();
        this.callbacks.onState("listening");
        break;
      case "input.speech.stopped":
        this.callbacks.onState("thinking");
        break;
      case "transcript.user.delta":
      case "transcript.user":
        if (message.text) this.callbacks.onTranscript("user", message.text);
        break;
      case "reply.started":
        this.agentTranscript = "";
        this.callbacks.onTranscript("agent", "");
        this.callbacks.onState("speaking");
        break;
      case "reply.audio":
        if (message.data) this.playAudio(message.data);
        break;
      case "transcript.agent.delta":
        if (message.delta) {
          this.agentTranscript = `${this.agentTranscript}${this.agentTranscript ? " " : ""}${message.delta}`;
          this.callbacks.onTranscript("agent", this.agentTranscript);
        }
        break;
      case "transcript.agent":
        if (message.text) this.callbacks.onTranscript("agent", message.text);
        break;
      case "tool.call":
        this.queueToolCall(message);
        break;
      case "reply.done":
        if (message.status === "interrupted") {
          this.pendingTools = [];
          this.flushPlayback();
        } else {
          this.drainToolCalls();
        }
        this.callbacks.onState("listening");
        break;
      case "session.error":
      case "error":
        this.fail(message.message ?? `AssemblyAI session error${message.code ? `: ${message.code}` : ""}.`);
        break;
      case "session.ended":
        this.cleanup();
        break;
    }
  }

  private queueToolCall(message: AgentEvent) {
    if (!message.call_id) return;
    if (message.name !== "revise_selected_line") {
      this.pendingTools.push({ callId: message.call_id, error: "Unknown tool requested." });
      return;
    }

    const text = typeof message.arguments?.text === "string" ? message.arguments.text.trim() : "";
    const direction =
      typeof message.arguments?.direction === "string" ? message.arguments.direction.trim() : "";

    if (!text || !direction || text.length > 500 || direction.length > 100) {
      this.pendingTools.push({
        callId: message.call_id,
        error: "The revision must include concise dialogue and a performance direction.",
      });
      return;
    }

    this.pendingTools.push({ callId: message.call_id, revision: { text, direction } });
  }

  private drainToolCalls() {
    const calls = this.pendingTools;
    this.pendingTools = [];

    for (const call of calls) {
      if (call.revision) this.callbacks.onRevision(call.revision);
      if (this.websocket?.readyState !== WebSocket.OPEN) continue;

      this.websocket.send(
        JSON.stringify({
          type: "tool.result",
          call_id: call.callId,
          result: JSON.stringify(
            call.revision
              ? { ok: true, updated: call.revision }
              : { ok: false, error: call.error ?? "The revision could not be applied." },
          ),
          is_error: !call.revision,
        }),
      );
    }
  }

  private playAudio(data: string) {
    if (!this.audioContext) return;

    const raw = atob(data);
    const samples = new Int16Array(raw.length / 2);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = raw.charCodeAt(index * 2) | (raw.charCodeAt(index * 2 + 1) << 8);
    }

    const audioBuffer = this.audioContext.createBuffer(1, samples.length, VOICE_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this.playbackSources.delete(source);
    this.playbackSources.add(source);

    const now = this.audioContext.currentTime;
    this.playbackTime = Math.max(this.playbackTime, now);
    source.start(this.playbackTime);
    this.playbackTime += audioBuffer.duration;
  }

  private flushPlayback() {
    for (const source of this.playbackSources) {
      try {
        source.stop();
      } catch {
        // The source already ended.
      }
    }
    this.playbackSources.clear();
    this.playbackTime = this.audioContext?.currentTime ?? 0;
  }

  private fail(message: string) {
    this.callbacks.onError(message);
    this.callbacks.onState("error");
    this.closing = true;
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: "session.end" }));
    }
    this.cleanup(false);
  }

  private cleanup(setIdle = true) {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.ready = false;
    if (this.endFallback) clearTimeout(this.endFallback);
    this.flushPlayback();
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.websocket?.close();
    if (setIdle) this.callbacks.onState("idle");
  }
}
