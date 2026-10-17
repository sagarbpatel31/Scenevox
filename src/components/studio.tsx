"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  characters,
  directionOptions,
  initialLines,
  type ScriptLine,
} from "@/lib/studio-data";
import { browserPreviewProvider } from "@/lib/tts/browser-preview";
import type { TtsPlayback } from "@/lib/tts/contracts";
import {
  DirectorSession,
  type DirectorState,
} from "@/lib/voice-agent/director-session";

type PlaybackState = "idle" | "playing";
type EngineState = "checking" | "browser-preview" | "assemblyai-ready";

const judgeTourSteps = [
  {
    title: "Start with a scene that is ready to perform",
    body: "A judge can understand the premise, select a line, and hear the first performance in seconds.",
    target: "script",
  },
  {
    title: "Cast for contrast",
    body: "Every character gets an independent voice, so writers can test whether a conversation feels distinct.",
    target: "cast",
  },
  {
    title: "Direct the emotional turn",
    body: "We will change Mara's pivotal line to “barely holding back,” then stream the full scene.",
    target: "direction",
  },
] as const;

function Icon({ name }: { name: "play" | "stop" | "spark" | "plus" | "chevron" | "mic" }) {
  const paths = {
    play: <path d="m9 7 8 5-8 5V7Z" />,
    stop: <rect x="8" y="8" width="8" height="8" rx="1" />,
    spark: <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    mic: <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-7-3a7 7 0 0 0 14 0M12 19v3M8 22h8" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      {paths[name]}
    </svg>
  );
}

function estimateDuration(lines: ScriptLine[]) {
  const words = lines.reduce((total, line) => total + line.text.trim().split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 2.45));
}

export function Studio() {
  const [lines, setLines] = useState(initialLines);
  const [selectedLineId, setSelectedLineId] = useState(initialLines[0].id);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceAssignments, setVoiceAssignments] = useState<Record<string, string>>({
    mara: "",
    orion: "",
  });
  const [statusText, setStatusText] = useState("Ready for direction");
  const [engineState, setEngineState] = useState<EngineState>("checking");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [directorState, setDirectorState] = useState<DirectorState>("idle");
  const [directorLineId, setDirectorLineId] = useState<string | null>(null);
  const [directorUserTranscript, setDirectorUserTranscript] = useState("");
  const [directorAgentTranscript, setDirectorAgentTranscript] = useState("");
  const [directorError, setDirectorError] = useState("");
  const [directorSessionId, setDirectorSessionId] = useState("");
  const stopRequested = useRef(false);
  const activePlayback = useRef<TtsPlayback | null>(null);
  const directorSession = useRef<DirectorSession | null>(null);

  useEffect(() => {
    const readVoices = () => setAvailableVoices(window.speechSynthesis?.getVoices() ?? []);
    readVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", readVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", readVoices);
  }, []);

  useEffect(
    () => () => {
      directorSession.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    let active = true;

    fetch("/api/health")
      .then((response) => response.json() as Promise<{ provider?: EngineState }>)
      .then((health) => {
        if (active && health.provider) setEngineState(health.provider);
      })
      .catch(() => {
        if (active) setEngineState("browser-preview");
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? lines[0];
  const selectedIndex = lines.findIndex((line) => line.id === selectedLine.id);
  const duration = useMemo(() => estimateDuration(lines), [lines]);

  const getCharacter = (characterId: string) =>
    characters.find((character) => character.id === characterId) ?? characters[0];

  const updateSelectedLine = (patch: Partial<ScriptLine>) => {
    setLines((current) =>
      current.map((line) => (line.id === selectedLine.id ? { ...line, ...patch } : line)),
    );
  };

  const speakLine = async (line: ScriptLine) => {
    const character = getCharacter(line.characterId);

    try {
      const playbackHandle = browserPreviewProvider.speak({
        text: line.text,
        voiceName: voiceAssignments[line.characterId],
        fallbackVoiceIndex: line.characterId === "mara" ? 0 : 1,
        rate: line.direction.includes("urgency") ? 1.04 : 0.93,
        pitch: character.voiceHint === "bright" ? 1.08 : 0.95,
        onStart: () => {
          setActiveLineId(line.id);
          setSelectedLineId(line.id);
          setStatusText(`${character.name} is performing`);
        },
      });
      activePlayback.current = playbackHandle;
      await playbackHandle.done;
      if (activePlayback.current === playbackHandle) activePlayback.current = null;
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Voice preview is unavailable");
    }
  };

  const playLines = async (sceneLines: ScriptLine[]) => {
    activePlayback.current?.cancel();
    stopRequested.current = false;
    setPlayback("playing");
    setStatusText("Streaming browser preview");
    for (const line of sceneLines) {
      if (stopRequested.current) break;
      await speakLine(line);
    }
    setPlayback("idle");
    setActiveLineId(null);
    setStatusText(stopRequested.current ? "Playback stopped" : "Scene complete");
  };

  const playScene = () => playLines(lines);

  const previewSelectedLine = async () => {
    activePlayback.current?.cancel();
    stopRequested.current = false;
    setPlayback("playing");
    await speakLine(selectedLine);
    setPlayback("idle");
    setActiveLineId(null);
    setStatusText("Take ready");
  };

  const stopPlayback = () => {
    stopRequested.current = true;
    activePlayback.current?.cancel();
    activePlayback.current = null;
    setPlayback("idle");
    setActiveLineId(null);
    setStatusText("Playback stopped");
  };

  const addLine = () => {
    const id = `line-${Date.now()}`;
    const nextLine: ScriptLine = {
      id,
      characterId: selectedLine.characterId === "mara" ? "orion" : "mara",
      direction: "gentle, precise",
      text: "Add the next beat of your scene here.",
    };
    setLines((current) => [...current, nextLine]);
    setSelectedLineId(id);
  };

  const shareScene = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatusText("Share link copied");
    } catch {
      setStatusText("Copy the current URL to share this scene");
    }
  };

  const startJudgeTour = () => {
    setTourStep(0);
    setSelectedLineId("line-1");
    setStatusText("Judge tour started");
  };

  const advanceJudgeTour = () => {
    if (tourStep === null) return;
    if (tourStep < judgeTourSteps.length - 1) {
      const nextStep = tourStep + 1;
      setTourStep(nextStep);
      if (nextStep === 2) setSelectedLineId("line-3");
      return;
    }

    const judgeCut = lines.map((line) =>
      line.id === "line-3" ? { ...line, direction: "barely holding back" } : line,
    );
    setLines(judgeCut);
    setTourStep(null);
    setStatusText("Directing the judge cut");
    void playLines(judgeCut);
  };

  const startDirector = async () => {
    stopPlayback();
    setTourStep(null);
    directorSession.current?.dispose();
    setDirectorUserTranscript("");
    setDirectorAgentTranscript("");
    setDirectorError("");
    setDirectorSessionId("");
    setDirectorLineId(selectedLine.id);

    const lineId = selectedLine.id;
    const lineNumber = selectedIndex + 1;
    const character = getCharacter(selectedLine.characterId);
    const session = new DirectorSession({
      onState: setDirectorState,
      onTranscript: (speaker, text) => {
        if (speaker === "user") setDirectorUserTranscript(text);
        else setDirectorAgentTranscript(text);
      },
      onRevision: (revision) => {
        setLines((current) =>
          current.map((line) =>
            line.id === lineId
              ? { ...line, text: revision.text, direction: revision.direction }
              : line,
          ),
        );
        setSelectedLineId(lineId);
        setStatusText(`Director updated line ${String(lineNumber).padStart(2, "0")}`);
      },
      onSession: setDirectorSessionId,
      onError: setDirectorError,
    });
    directorSession.current = session;

    await session.connect({
      lineId,
      lineNumber,
      characterName: character.name,
      text: selectedLine.text,
      direction: selectedLine.direction,
    });
  };

  const endDirector = () => {
    directorSession.current?.end();
    setStatusText("Director session ended");
  };

  const engineLabel = {
    checking: "Checking voice engine",
    "browser-preview": "Browser preview · API key not configured",
    "assemblyai-ready": "AssemblyAI Voice Agent ready",
  }[engineState];

  const directorStatus = {
    idle: "Ready",
    connecting: "Connecting",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    ending: "Ending",
    error: "Needs attention",
  }[directorState];

  const directorActive = !["idle", "error"].includes(directorState);
  const directedLine = directorLineId
    ? lines.find((line) => line.id === directorLineId)
    : selectedLine;
  const directedCharacter = getCharacter(directedLine?.characterId ?? selectedLine.characterId);
  const directedLineNumber = directedLine
    ? lines.findIndex((line) => line.id === directedLine.id) + 1
    : selectedIndex + 1;

  const activeTour = tourStep === null ? null : judgeTourSteps[tourStep];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#studio" aria-label="SceneVox studio home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>SceneVox</span>
        </a>
        <div className="project-trail" aria-label="Current project">
          <span>Projects</span>
          <Icon name="chevron" />
          <strong>The Last Garden</strong>
        </div>
        <div className="top-actions">
          <span className="save-state"><i /> Saved</span>
          <button className="ghost-button tour-trigger" type="button" onClick={startJudgeTour}>60s judge tour</button>
          <button className="ghost-button share-button" type="button" onClick={shareScene}>Share scene</button>
          <div className="avatar" aria-label="Sagar Patel">SP</div>
        </div>
      </header>

      <section className="hero-strip">
        <div>
          <p className="eyebrow">Streaming performance studio</p>
          <h1>Hear the scene<br />before you shoot it.</h1>
        </div>
        <p className="hero-copy">
          Cast every role, direct every line, and audition a full performance while the idea is still fresh.
        </p>
        <div className={`engine-pill ${engineState}`}>
          <span className="engine-dot" />
          <span>{engineLabel}</span>
        </div>
      </section>

      <section className="studio" id="studio">
        <div className={`panel script-panel ${activeTour?.target === "script" ? "tour-target" : ""}`}>
          <div className="panel-header">
            <div>
              <p className="kicker">Script</p>
              <h2>The Last Garden</h2>
            </div>
            <span className="meta-chip">Scene 04 · {duration}s</span>
          </div>

          <div className="scene-note">
            <span>INT. ORBITAL SEED VAULT — ARTIFICIAL DAWN</span>
            <p>A failing ship gives its garden one last sunrise.</p>
          </div>

          <div className="script-lines" aria-label="Scene dialogue">
            {lines.map((line, index) => {
              const character = getCharacter(line.characterId);
              const isSelected = line.id === selectedLine.id;
              const isActive = line.id === activeLineId;
              return (
                <button
                  className={`script-line ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
                  key={line.id}
                  onClick={() => setSelectedLineId(line.id)}
                  type="button"
                  style={{ "--character": character.color } as React.CSSProperties}
                >
                  <span className="line-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="line-copy">
                    <span className="speaker-row">
                      <strong>{character.name}</strong>
                      <em>{line.direction}</em>
                    </span>
                    <span className="dialogue">{line.text}</span>
                  </span>
                  <span className="line-play" aria-hidden="true"><Icon name="play" /></span>
                </button>
              );
            })}
          </div>

          <button className="add-line" type="button" onClick={addLine}>
            <Icon name="plus" /> Add a line
          </button>
        </div>

        <aside className={`panel cast-panel ${activeTour?.target === "cast" ? "tour-target" : ""}`}>
          <div className="panel-header compact">
            <div>
              <p className="kicker">Cast</p>
              <h2>Voices</h2>
            </div>
            <span className="meta-chip">2 roles</span>
          </div>

          <div className="cast-list">
            {characters.map((character) => (
              <article className="cast-card" key={character.id}>
                <div className="character-avatar" style={{ background: character.color }}>
                  {character.name.split(" ").map((part) => part[0]).join("")}
                </div>
                <div className="cast-copy">
                  <strong>{character.name}</strong>
                  <span>{character.role}</span>
                  <label>
                    <span className="sr-only">Voice for {character.name}</span>
                    <select
                      value={voiceAssignments[character.id] ?? ""}
                      onChange={(event) =>
                        setVoiceAssignments((current) => ({
                          ...current,
                          [character.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Automatic · best local match</option>
                      {availableVoices.length ? (
                        availableVoices.slice(0, 12).map((voice) => (
                          <option key={voice.name} value={voice.name}>{voice.name}</option>
                        ))
                      ) : null}
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="cast-tip">
            <Icon name="spark" />
            <p><strong>Director&apos;s note</strong><br />Contrast the voices. Mara should feel close; Orion should feel like light through glass.</p>
          </div>
        </aside>

        <aside className={`panel direction-panel ${activeTour?.target === "direction" ? "tour-target" : ""}`}>
          <div className="panel-header compact">
            <div>
              <p className="kicker">Direction</p>
              <h2>Line {String(selectedIndex + 1).padStart(2, "0")}</h2>
            </div>
            <button className="icon-button" type="button" onClick={previewSelectedLine} aria-label="Preview selected line">
              <Icon name="play" />
            </button>
          </div>

          <label className="field-label" htmlFor="line-text">Dialogue</label>
          <textarea
            id="line-text"
            value={selectedLine.text}
            onChange={(event) => updateSelectedLine({ text: event.target.value })}
            rows={5}
          />

          <div className="field-label">Performance</div>
          <div className="direction-chips">
            {directionOptions.map((direction) => (
              <button
                key={direction}
                type="button"
                className={selectedLine.direction === direction ? "active" : ""}
                aria-pressed={selectedLine.direction === direction}
                onClick={() => updateSelectedLine({ direction })}
              >
                {direction}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="character-select">Speaker</label>
          <select
            id="character-select"
            className="wide-select"
            value={selectedLine.characterId}
            onChange={(event) => updateSelectedLine({ characterId: event.target.value })}
          >
            {characters.map((character) => (
              <option key={character.id} value={character.id}>{character.name}</option>
            ))}
          </select>

          <section className={`director-card ${directorActive ? "active" : ""}`} aria-live="polite">
            <div className="director-card-header">
              <div>
                <span className="director-kicker">AssemblyAI Director</span>
                <strong>{directorStatus}</strong>
              </div>
              <span className={`director-orb ${directorState}`} aria-hidden="true">
                <Icon name="mic" />
              </span>
            </div>

            {directorActive || directorUserTranscript || directorAgentTranscript || directorError ? (
              <div className="director-conversation">
                <span className="director-context">
                  Line {String(directedLineNumber).padStart(2, "0")} · {directedCharacter.name}
                </span>
                {directorUserTranscript ? (
                  <p><strong>You</strong>{directorUserTranscript}</p>
                ) : null}
                {directorAgentTranscript ? (
                  <p className="agent"><strong>Director</strong>{directorAgentTranscript}</p>
                ) : null}
                {directorError ? <p className="director-error">{directorError}</p> : null}
              </div>
            ) : (
              <p className="director-intro">
                Select a line, then describe the emotional change out loud. The director can rewrite it in place.
              </p>
            )}

            <div className="director-actions">
              <span>
                {directorSessionId ? `Live · ${directorSessionId.slice(-6)}` : "Winter voice · 5 min cap"}
              </span>
              {directorActive ? (
                <button type="button" className="director-button end" onClick={endDirector}>
                  <Icon name="stop" /> End
                </button>
              ) : (
                <button
                  type="button"
                  className="director-button"
                  onClick={startDirector}
                  disabled={engineState !== "assemblyai-ready" || directorState === "connecting"}
                >
                  <Icon name="mic" /> Talk to Director
                </button>
              )}
            </div>
          </section>
        </aside>

        <div className="performance-bar">
          <div className="now-playing">
            <span className={`live-orb ${playback === "playing" ? "playing" : ""}`}>
              {playback === "playing" ? <Icon name="spark" /> : <Icon name="play" />}
            </span>
            <div>
              <span>{statusText}</span>
              <strong>{activeLineId ? getCharacter(lines.find((line) => line.id === activeLineId)?.characterId ?? "mara").name : "Full scene"}</strong>
            </div>
          </div>

          <div className={`waveform ${playback === "playing" ? "playing" : ""}`} aria-label="Audio activity">
            {Array.from({ length: 34 }, (_, index) => (
              <i key={index} style={{ "--delay": `${(index % 9) * 45}ms`, "--height": `${24 + ((index * 17) % 64)}%` } as React.CSSProperties} />
            ))}
          </div>

          <div className="stream-stats">
            <span><strong>{duration}s</strong> est. scene</span>
            <span><strong>2</strong> voices</span>
          </div>

          {playback === "playing" ? (
            <button className="primary-button stop" type="button" onClick={stopPlayback}>
              <Icon name="stop" /> Stop
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={playScene}>
              <Icon name="play" /> Stream scene
            </button>
          )}
        </div>
      </section>

      {activeTour ? (
        <aside className="tour-card" aria-live="polite" aria-label="60-second judge tour">
          <div className="tour-progress" aria-label={`Step ${tourStep! + 1} of ${judgeTourSteps.length}`}>
            {judgeTourSteps.map((step, index) => (
              <i key={step.title} className={index === tourStep ? "active" : ""} />
            ))}
          </div>
          <p>Judge tour · {tourStep! + 1}/{judgeTourSteps.length}</p>
          <h2>{activeTour.title}</h2>
          <span>{activeTour.body}</span>
          <div className="tour-actions">
            <button type="button" className="tour-close" onClick={() => setTourStep(null)}>Close</button>
            <button type="button" className="primary-button" onClick={advanceJudgeTour}>
              {tourStep === judgeTourSteps.length - 1 ? <><Icon name="play" /> Stream judge cut</> : <>Next <Icon name="chevron" /></>}
            </button>
          </div>
        </aside>
      ) : null}

      <footer>
        <span>SceneVox · built for AssemblyAI Voice Hackathon Week</span>
        <span>From script to performance, at the speed of thought.</span>
      </footer>
    </main>
  );
}
