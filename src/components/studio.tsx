"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  characters,
  directionOptions,
  initialLines,
  type ScriptLine,
} from "@/lib/studio-data";

type PlaybackState = "idle" | "playing";

function Icon({ name }: { name: "play" | "stop" | "spark" | "plus" | "chevron" }) {
  const paths = {
    play: <path d="m9 7 8 5-8 5V7Z" />,
    stop: <rect x="8" y="8" width="8" height="8" rx="1" />,
    spark: <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 18 6-6-6-6" />,
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
  const stopRequested = useRef(false);
  const resolveCurrentLine = useRef<(() => void) | null>(null);

  useEffect(() => {
    const readVoices = () => setAvailableVoices(window.speechSynthesis?.getVoices() ?? []);
    readVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", readVoices);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", readVoices);
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

  const speakLine = (line: ScriptLine) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        setStatusText("Browser speech is not available here");
        resolve();
        return;
      }

      const character = getCharacter(line.characterId);
      const utterance = new SpeechSynthesisUtterance(line.text);
      const englishVoices = availableVoices.filter((voice) =>
        voice.lang.toLowerCase().startsWith("en"),
      );
      const voicePool = englishVoices.length ? englishVoices : availableVoices;
      const automaticVoice =
        line.characterId === "mara" ? voicePool[0] : voicePool[Math.min(1, voicePool.length - 1)];
      const chosenVoice =
        availableVoices.find((voice) => voice.name === voiceAssignments[line.characterId]) ??
        automaticVoice;
      if (chosenVoice) utterance.voice = chosenVoice;
      utterance.rate = line.direction.includes("urgency") ? 1.04 : 0.93;
      utterance.pitch = character.voiceHint === "bright" ? 1.08 : 0.95;
      utterance.onstart = () => {
        setActiveLineId(line.id);
        setSelectedLineId(line.id);
        setStatusText(`${character.name} is performing`);
      };
      const finish = () => {
        resolveCurrentLine.current = null;
        resolve();
      };
      resolveCurrentLine.current = finish;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });

  const playScene = async () => {
    window.speechSynthesis?.cancel();
    stopRequested.current = false;
    setPlayback("playing");
    setStatusText("Streaming browser preview");
    for (const line of lines) {
      if (stopRequested.current) break;
      await speakLine(line);
    }
    setPlayback("idle");
    setActiveLineId(null);
    setStatusText(stopRequested.current ? "Playback stopped" : "Scene complete");
  };

  const previewSelectedLine = async () => {
    window.speechSynthesis?.cancel();
    stopRequested.current = false;
    setPlayback("playing");
    await speakLine(selectedLine);
    setPlayback("idle");
    setActiveLineId(null);
    setStatusText("Take ready");
  };

  const stopPlayback = () => {
    stopRequested.current = true;
    window.speechSynthesis?.cancel();
    resolveCurrentLine.current?.();
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
          <button className="ghost-button" type="button">Share scene</button>
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
        <div className="engine-pill">
          <span className="engine-dot" />
          <span><strong>Browser preview</strong> · AssemblyAI adapter ready</span>
        </div>
      </section>

      <section className="studio" id="studio">
        <div className="panel script-panel">
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

        <aside className="panel cast-panel">
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

        <aside className="panel direction-panel">
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

      <footer>
        <span>SceneVox · built for AssemblyAI Voice Hackathon Week</span>
        <span>From script to performance, at the speed of thought.</span>
      </footer>
    </main>
  );
}
