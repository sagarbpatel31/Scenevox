export type TtsProviderId = "browser-preview" | "assemblyai";

export type TtsSpeakRequest = {
  text: string;
  voiceName?: string;
  fallbackVoiceIndex?: number;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
};

export type TtsPlayback = {
  done: Promise<void>;
  cancel: () => void;
};

export type TtsProvider = {
  id: TtsProviderId;
  speak: (request: TtsSpeakRequest) => TtsPlayback;
};
