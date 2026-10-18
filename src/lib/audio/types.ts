export type WordTiming = { text: string; startMs: number; endMs: number };
export type AudioMetadata = {
  assetId: string;
  voice: string;
  fingerprint: string;
  duration: number;
  transcript: string;
  timings: WordTiming[];
  firstAudioMs: number;
  sessionMs: number;
  providerSessionMs?: number;
  sessionId: string;
  endedCleanly: boolean;
};
export type AudioAsset = { id: string; wav: Blob; metadata: AudioMetadata };
export type AssemblyVoice = { id: string; name: string };
