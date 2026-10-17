import type { TtsPlayback, TtsProvider, TtsSpeakRequest } from "./contracts";

function selectVoice(request: TtsSpeakRequest) {
  const voices = window.speechSynthesis.getVoices();
  const englishVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith("en"),
  );
  const voicePool = englishVoices.length ? englishVoices : voices;

  return (
    voices.find((voice) => voice.name === request.voiceName) ??
    voicePool[
      Math.min(
        request.fallbackVoiceIndex ?? 0,
        Math.max(voicePool.length - 1, 0),
      )
    ]
  );
}

function speak(request: TtsSpeakRequest): TtsPlayback {
  if (
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    throw new Error("Browser speech is not available here");
  }

  let finish = () => undefined;
  let fail = () => undefined;
  const done = new Promise<void>((resolve, reject) => {
    let finished = false;
    finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    fail = () => {
      if (finished) return;
      finished = true;
      reject(
        new Error(
          "Device speech is unavailable. Try another local voice or use the live Director.",
        ),
      );
    };
  });

  const utterance = new SpeechSynthesisUtterance(request.text);
  const voice = selectVoice(request);
  if (voice) utterance.voice = voice;
  utterance.rate = request.rate ?? 1;
  utterance.pitch = request.pitch ?? 1;
  utterance.onstart = () => request.onStart?.();
  utterance.onend = finish;
  utterance.onerror = fail;
  window.speechSynthesis.speak(utterance);

  return {
    done,
    cancel: () => {
      finish();
      window.speechSynthesis.cancel();
    },
  };
}

export const browserPreviewProvider: TtsProvider = {
  id: "browser-preview",
  speak,
};
