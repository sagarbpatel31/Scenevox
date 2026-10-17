"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { directionOptions, type ScriptLine } from "@/lib/studio-data";
import {
  createDemoScene,
  decodeSharedScene,
  encodeSharedScene,
  makeTake,
  SCENE_STORAGE_KEY,
  screenplayText,
  validateScene,
  type SceneDocument,
  type SceneTake,
} from "@/lib/scene-document";
import { browserPreviewProvider } from "@/lib/tts/browser-preview";
import type { TtsPlayback } from "@/lib/tts/contracts";
import type { DirectorRevision } from "@/lib/voice-agent/director-session";
import { DirectorBooth } from "./director-booth";
import { ImportDialog } from "./import-dialog";
import { TakeComparison } from "./take-comparison";

type History = {
  scene: SceneDocument;
  past: SceneDocument[];
  future: SceneDocument[];
};
type HistoryAction =
  | { type: "edit"; update: (scene: SceneDocument) => SceneDocument }
  | { type: "load"; scene: SceneDocument }
  | { type: "undo" | "redo" };
function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "load")
    return { scene: action.scene, past: [], future: [] };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous
      ? {
          scene: previous,
          past: state.past.slice(0, -1),
          future: [state.scene, ...state.future],
        }
      : state;
  }
  if (action.type === "redo") {
    const next = state.future[0];
    return next
      ? {
          scene: next,
          past: [...state.past, state.scene],
          future: state.future.slice(1),
        }
      : state;
  }
  if (action.type === "edit")
    return {
      scene: action.update(state.scene),
      past: [...state.past.slice(-39), state.scene],
      future: [],
    };
  return state;
}

function downloadFile(contents: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const tourSteps = [
  {
    title: "A scene, ready for its first read.",
    body: "Choose a line to edit. Import your own script to create a cast automatically, or explore this sample.",
    target: "script",
  },
  {
    title: "Speak the change you want.",
    body: "Open the Director’s booth. Try: “Shorten this line, with fear beneath the smile.” AssemblyAI listens, revises the line, and speaks its response.",
    target: "direction",
  },
  {
    title: "Keep the take that tells the story.",
    body: "Open Takes to audition and restore versions. Your scene saves automatically; share a snapshot or export the script.",
    target: "direction",
  },
] as const;

export function Studio() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({
    scene: createDemoScene(),
    past: [],
    future: [],
  }));
  const { scene } = history;
  const { lines, characters, voiceAssignments } = scene;
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("Loading scene…");
  const [selectedLineId, setSelectedLineId] = useState("line-1");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [statusText, setStatusText] = useState("Ready for your first read");
  const [engineReady, setEngineReady] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [editorTab, setEditorTab] = useState<"direction" | "takes">(
    "direction",
  );
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const activePlayback = useRef<TtsPlayback | null>(null);
  const playbackGeneration = useRef(0);
  const stopPlayback = useCallback(() => {
    playbackGeneration.current++;
    activePlayback.current?.cancel();
    activePlayback.current = null;
    setPlaying(false);
    setActiveLineId(null);
  }, []);
  const selectedLine =
    lines.find((line) => line.id === selectedLineId) ?? lines[0];
  const selectedIndex = lines.findIndex((line) => line.id === selectedLine.id);
  const selectedCharacter =
    characters.find((character) => character.id === selectedLine.characterId) ??
    characters[0];
  const selectedTakes = scene.takes.filter(
    (take) => take.lineId === selectedLine.id,
  );
  const wordCount = lines.reduce(
    (count, line) =>
      count + (line.text.trim() ? line.text.trim().split(/\s+/).length : 0),
    0,
  );
  const duration = Math.max(1, Math.round(wordCount / (2.45 * speed)));
  const activeTour = tourStep === null ? null : tourSteps[tourStep];
  const directorContext = useMemo(
    () => ({
      lineId: selectedLine.id,
      lineNumber: selectedIndex + 1,
      characterName: selectedCharacter.name,
      text: selectedLine.text,
      direction: selectedLine.direction,
    }),
    [
      selectedLine.id,
      selectedLine.text,
      selectedLine.direction,
      selectedIndex,
      selectedCharacter.name,
    ],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      let restoredShared = false;
      const shared = window.location.hash.startsWith("#scene=")
        ? window.location.hash.slice(7)
        : null;
      try {
        if (shared) {
          dispatch({ type: "load", scene: decodeSharedScene(shared) });
          restoredShared = true;
          setStatusText("Shared scene loaded — your edits save on this device");
        }
      } catch {
        setStatusText(
          "This share link could not be read. Your saved scene is still available.",
        );
      }
      if (!restoredShared) {
        try {
          const stored = localStorage.getItem(SCENE_STORAGE_KEY);
          if (stored)
            dispatch({
              type: "load",
              scene: validateScene(JSON.parse(stored)),
            });
        } catch {
          setStatusText(
            "Could not restore the previous scene. The sample is ready.",
          );
        }
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
        setSaveState("Saved on this device");
      } catch {
        setSaveState("Could not save · export to keep a copy");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [scene, loaded]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setEngineReady(data.provider === "assemblyai-ready"))
      .catch(() => {});
    const readVoices = () =>
      setVoices(window.speechSynthesis?.getVoices() ?? []);
    readVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", readVoices);
    return () => {
      controller.abort();
      window.speechSynthesis?.removeEventListener("voiceschanged", readVoices);
    };
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z" ||
        (event.target instanceof HTMLElement &&
          /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))
      )
        return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const edit = (update: (current: SceneDocument) => SceneDocument) =>
    dispatch({ type: "edit", update });
  const updateLine = (patch: Partial<ScriptLine>) =>
    edit((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === selectedLine.id ? { ...line, ...patch } : line,
      ),
    }));

  const playLines = async (readLines: ScriptLine[]) => {
    stopPlayback();
    const generation = playbackGeneration.current;
    setPlaying(true);
    setStatusText("Playing device voice preview");
    try {
      for (const line of readLines) {
        if (generation !== playbackGeneration.current) return;
        if (!line.text.trim()) continue;
        const characterIndex = Math.max(
          0,
          characters.findIndex(
            (character) => character.id === line.characterId,
          ),
        );
        const character = characters[characterIndex];
        const handle = browserPreviewProvider.speak({
          text: line.text,
          voiceName: voiceAssignments[line.characterId],
          fallbackVoiceIndex: characterIndex,
          rate: speed * (line.direction.includes("urgency") ? 1.04 : 0.93),
          pitch: character.voiceHint === "bright" ? 1.08 : 0.95,
          onStart: () => {
            if (generation === playbackGeneration.current) {
              setActiveLineId(line.id);
              setStatusText(character.name + " · device preview");
            }
          },
        });
        activePlayback.current = handle;
        await handle.done;
      }
      if (generation === playbackGeneration.current) {
        setPlaying(false);
        setActiveLineId(null);
        setStatusText("Read complete");
      }
    } catch (error) {
      if (generation === playbackGeneration.current) {
        setPlaying(false);
        setActiveLineId(null);
        setStatusText(
          error instanceof Error ? error.message : "Could not play this take",
        );
      }
    }
  };

  const applyRevision = useCallback(
    (revision: DirectorRevision, lineId: string) => {
      dispatch({
        type: "edit",
        update: (current) => {
          const original = current.lines.find((line) => line.id === lineId);
          if (!original) return current;
          const revised = { ...original, ...revision };
          return {
            ...current,
            lines: current.lines.map((line) =>
              line.id === lineId ? revised : line,
            ),
            takes: [
              ...current.takes,
              makeTake(original, "Saved take"),
              makeTake(revised, "Director"),
            ].slice(-200),
          };
        },
      });
      setStatusText("Director revision saved · compare it in Takes");
    },
    [],
  );

  const loadScene = (next: SceneDocument) => {
    stopPlayback();
    dispatch({ type: "edit", update: () => next });
    setSelectedLineId(next.lines[0].id);
    setStatusText(next.title + " is ready");
    window.history.replaceState(null, "", window.location.pathname);
  };
  const shareScene = async () => {
    try {
      const url =
        window.location.origin +
        window.location.pathname +
        "#scene=" +
        encodeSharedScene(scene);
      await navigator.clipboard.writeText(url);
      setStatusText(
        "Scene snapshot link copied — includes your dialogue and cast",
      );
    } catch (error) {
      setStatusText(
        error instanceof Error
          ? error.message
          : "Could not copy the scene link",
      );
    }
  };
  const slug = scene.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "scene";

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
        <div className="project-trail">
          <span>Studio</span>
          <span aria-hidden="true">›</span>
          <strong>{scene.title}</strong>
        </div>
        <div className="top-actions">
          <span className="save-state">
            <i />
            {saveState}
          </span>
          <button
            className="ghost-button tour-trigger"
            type="button"
            onClick={() => {
              setTourStep(0);
              setSelectedLineId(lines[Math.min(2, lines.length - 1)].id);
            }}
          >
            60s judge tour
          </button>
          <button
            className="ghost-button share-button"
            type="button"
            onClick={shareScene}
          >
            Share scene ↗
          </button>
        </div>
      </header>

      <section className="hero-strip">
        <div>
          <p className="eyebrow">The writer’s rehearsal room</p>
          <h1>
            Give your words
            <br />a first performance.
          </h1>
        </div>
        <p className="hero-copy">
          Write the scene. Speak your direction. Find the take that makes
          someone feel something.
        </p>
        <div
          className={
            "engine-pill " + (engineReady ? "assemblyai-ready" : "checking")
          }
        >
          <span className="engine-dot" />
          <span>
            {engineReady
              ? "AssemblyAI Director ready"
              : "Device preview available"}
          </span>
        </div>
      </section>

      <nav className="workspace-toolbar" aria-label="Scene tools">
        <div>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => setShowImport(true)}
          >
            ＋ Import script
          </button>
          <details className="export-menu">
            <summary>Export ↓</summary>
            <div>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    screenplayText(scene),
                    slug + ".txt",
                    "text/plain",
                  )
                }
              >
                Screenplay (.txt)
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    JSON.stringify(scene, null, 2),
                    slug + ".scenevox.json",
                    "application/json",
                  )
                }
              >
                Scene + takes (.json)
              </button>
            </div>
          </details>
        </div>
        <div>
          <button
            className="toolbar-button subtle"
            type="button"
            onClick={() => dispatch({ type: "undo" })}
            disabled={!history.past.length}
            aria-label="Undo scene edit"
          >
            ↶ Undo
          </button>
          <button
            className="toolbar-button subtle"
            type="button"
            onClick={() => dispatch({ type: "redo" })}
            disabled={!history.future.length}
            aria-label="Redo scene edit"
          >
            ↷ Redo
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className="toolbar-button subtle"
            onClick={() => loadScene(createDemoScene())}
          >
            Load demo
          </button>
        </div>
      </nav>

      <section className="studio" id="studio">
        <div
          className={
            "panel script-panel " +
            (activeTour?.target === "script" ? "tour-target" : "")
          }
        >
          <div className="panel-header">
            <div>
              <p className="kicker">Your scene</p>
              <label className="sr-only" htmlFor="scene-title">
                Scene title
              </label>
              <input
                className="scene-title"
                id="scene-title"
                value={scene.title}
                maxLength={80}
                onChange={(event) =>
                  edit((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <span className="meta-chip">
              {lines.length} lines · {wordCount} words
            </span>
          </div>
          <div className="scene-note">
            <span>{scene.setting}</span>
            <p>{scene.premise}</p>
          </div>
          <div className="script-lines" aria-label="Scene dialogue">
            {lines.map((line, index) => {
              const character =
                characters.find((item) => item.id === line.characterId) ??
                characters[0];
              return (
                <button
                  type="button"
                  key={line.id}
                  className={
                    "script-line " +
                    (line.id === selectedLine.id ? "selected " : "") +
                    (line.id === activeLineId ? "active" : "")
                  }
                  onClick={() => setSelectedLineId(line.id)}
                  aria-pressed={line.id === selectedLine.id}
                  aria-label={
                    "Select line " + (index + 1) + ": " + character.name
                  }
                  style={
                    { "--character": character.color } as React.CSSProperties
                  }
                >
                  <span className="line-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="line-copy">
                    <span className="speaker-row">
                      <strong>{character.name}</strong>
                      <em>{line.direction}</em>
                    </span>
                    <span className="dialogue">
                      {line.text || "An unwritten beat…"}
                    </span>
                  </span>
                  <span className="line-play" aria-hidden="true">
                    ↗
                  </span>
                </button>
              );
            })}
          </div>
          <button
            className="add-line"
            type="button"
            disabled={lines.length >= 100}
            onClick={() => {
              const id = crypto.randomUUID();
              edit((current) => ({
                ...current,
                lines: [
                  ...current.lines,
                  {
                    id,
                    characterId:
                      characters[
                        (characters.findIndex(
                          (item) => item.id === selectedLine.characterId,
                        ) +
                          1) %
                          characters.length
                      ].id,
                    direction: "natural, conversational",
                    text: "",
                  },
                ],
              }));
              setSelectedLineId(id);
            }}
          >
            ＋ Add a line
          </button>
        </div>

        <aside className="panel cast-panel">
          <div className="panel-header compact">
            <div>
              <p className="kicker">Cast</p>
              <h2>Find their voices.</h2>
            </div>
            <span className="meta-chip">{characters.length} roles</span>
          </div>
          <p className="cast-caption">
            Device voices for script rehearsal. The live Director speaks with
            AssemblyAI.
          </p>
          <div className="cast-list">
            {characters.map((character) => (
              <article key={character.id} className="cast-card">
                <div
                  className="character-avatar"
                  style={{ background: character.color }}
                >
                  {character.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="cast-copy">
                  <strong>{character.name}</strong>
                  <span>{character.role}</span>
                  <label>
                    <span className="sr-only">Voice for {character.name}</span>
                    <select
                      value={voiceAssignments[character.id] ?? ""}
                      onChange={(event) =>
                        edit((current) => ({
                          ...current,
                          voiceAssignments: {
                            ...current.voiceAssignments,
                            [character.id]: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">Automatic local voice</option>
                      {voices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.name}>
                          {voice.name} · {voice.lang}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
          <div className="cast-tip">
            <span aria-hidden="true">✦</span>
            <p>
              <strong>The subtext is the story.</strong>
              <br />A different intention can change the same words. Save two
              takes, then hear which one lands.
            </p>
          </div>
          <div className="scene-metrics">
            <div>
              <strong>{duration}s</strong>
              <span>estimated read</span>
            </div>
            <div>
              <strong>
                {
                  scene.takes.filter((take) => take.source === "Director")
                    .length
                }
              </strong>
              <span>Director takes</span>
            </div>
          </div>
        </aside>

        <aside
          className={
            "panel direction-panel " +
            (activeTour?.target === "direction" ? "tour-target" : "")
          }
        >
          <div className="panel-header compact">
            <div>
              <p className="kicker">The close-up</p>
              <h2>Line {String(selectedIndex + 1).padStart(2, "0")}</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => void playLines([selectedLine])}
              aria-label="Preview selected line"
            >
              ▷
            </button>
          </div>
          <DirectorBooth
            key={scene.characters.map((character) => character.id).join("-")}
            context={directorContext}
            enabled={engineReady}
            playing={playing}
            onStart={stopPlayback}
            onRevision={applyRevision}
          />
          <div className="editor-tabs" role="tablist" aria-label="Line editor">
            <button
              type="button"
              role="tab"
              id="direction-tab"
              aria-controls="direction-editor"
              aria-selected={editorTab === "direction"}
              onClick={() => setEditorTab("direction")}
            >
              Direction
            </button>
            <button
              type="button"
              role="tab"
              id="takes-tab"
              aria-controls="takes-editor"
              aria-selected={editorTab === "takes"}
              onClick={() => setEditorTab("takes")}
            >
              Takes <span>{selectedTakes.length}</span>
            </button>
          </div>
          {editorTab === "direction" ? (
            <div
              id="direction-editor"
              role="tabpanel"
              aria-labelledby="direction-tab"
            >
              <label className="field-label" htmlFor="line-text">
                Dialogue
              </label>
              <textarea
                id="line-text"
                value={selectedLine.text}
                maxLength={1_000}
                rows={4}
                onChange={(event) => updateLine({ text: event.target.value })}
              />
              <label className="field-label" htmlFor="line-direction">
                Performance direction
              </label>
              <input
                className="direction-input"
                id="line-direction"
                value={selectedLine.direction}
                maxLength={100}
                onChange={(event) =>
                  updateLine({ direction: event.target.value })
                }
              />
              <div className="direction-chips">
                {directionOptions.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    aria-pressed={selectedLine.direction === direction}
                    className={
                      selectedLine.direction === direction ? "active" : ""
                    }
                    onClick={() => updateLine({ direction })}
                  >
                    {direction}
                  </button>
                ))}
              </div>
              <label className="field-label" htmlFor="character-select">
                Speaker
              </label>
              <select
                id="character-select"
                className="wide-select"
                value={selectedLine.characterId}
                onChange={(event) =>
                  updateLine({ characterId: event.target.value })
                }
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
              <div className="line-tools">
                <button
                  type="button"
                  onClick={() => {
                    edit((current) => ({
                      ...current,
                      takes: [
                        ...current.takes,
                        makeTake(selectedLine, "Saved take"),
                      ].slice(-200),
                    }));
                    setStatusText("Take saved for comparison");
                  }}
                >
                  ＋ Save take
                </button>
                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => {
                    stopPlayback();
                    edit((current) => ({
                      ...current,
                      lines: current.lines.filter(
                        (line) => line.id !== selectedLine.id,
                      ),
                      takes: current.takes.filter(
                        (take) => take.lineId !== selectedLine.id,
                      ),
                    }));
                    setSelectedLineId(lines[Math.max(0, selectedIndex - 1)].id);
                  }}
                >
                  Delete line
                </button>
              </div>
            </div>
          ) : (
            <div id="takes-editor" role="tabpanel" aria-labelledby="takes-tab">
              <TakeComparison
                takes={selectedTakes}
                currentText={selectedLine.text}
                onPreview={(take) =>
                  void playLines([
                    {
                      ...selectedLine,
                      text: take.text,
                      direction: take.direction,
                    },
                  ])
                }
                onRestore={(take: SceneTake) => {
                  updateLine({ text: take.text, direction: take.direction });
                  setStatusText("Take restored — undo is available");
                }}
              />
            </div>
          )}
        </aside>

        <div className="performance-bar">
          <div className="now-playing">
            <span
              className={"live-orb " + (playing ? "playing" : "")}
              aria-hidden="true"
            >
              {playing ? "✦" : "▷"}
            </span>
            <div>
              <span role="status">{statusText}</span>
              <strong>
                {activeLineId
                  ? characters.find(
                      (character) =>
                        character.id ===
                        lines.find((line) => line.id === activeLineId)
                          ?.characterId,
                    )?.name
                  : scene.title}
              </strong>
            </div>
          </div>
          <div
            className={"waveform " + (playing ? "playing" : "")}
            aria-hidden="true"
          >
            {Array.from({ length: 24 }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--delay": (index % 9) * 45 + "ms",
                    "--height": 24 + ((index * 17) % 64) + "%",
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <label className="playback-speed">
            <span>Device preview</span>
            <select
              value={speed}
              aria-label="Playback speed"
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              <option value={0.8}>0.8×</option>
              <option value={1}>1×</option>
              <option value={1.2}>1.2×</option>
            </select>
          </label>
          <button
            className={"primary-button " + (playing ? "stop" : "")}
            type="button"
            onClick={() => {
              if (playing) {
                stopPlayback();
                setStatusText("Playback stopped");
              } else void playLines(lines);
            }}
          >
            {playing ? "■ Stop" : "▷ Play scene"}
          </button>
        </div>
      </section>

      {showImport ? (
        <ImportDialog
          onImport={loadScene}
          onClose={() => setShowImport(false)}
        />
      ) : null}
      {activeTour ? (
        <aside
          className="tour-card"
          aria-live="polite"
          aria-label="60-second judge tour"
        >
          <div className="tour-progress">
            {tourSteps.map((step, index) => (
              <i
                key={step.title}
                className={index === tourStep ? "active" : ""}
              />
            ))}
          </div>
          <p>Judge tour · {(tourStep ?? 0) + 1}/3</p>
          <h2>{activeTour.title}</h2>
          <span>{activeTour.body}</span>
          <div className="tour-actions">
            <button
              type="button"
              className="tour-close"
              onClick={() => setTourStep(null)}
            >
              Close tour
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (tourStep === 2) {
                  setEditorTab("takes");
                  setTourStep(null);
                } else {
                  setTourStep((current) => (current ?? 0) + 1);
                  setEditorTab("direction");
                }
              }}
            >
              {tourStep === 2 ? "Explore takes ↗" : "Next →"}
            </button>
          </div>
        </aside>
      ) : null}
      <footer>
        <span>SceneVox · A rehearsal room for the stories worth telling.</span>
        <span>
          Live Director by AssemblyAI · Scene playback uses device voices.
        </span>
      </footer>
    </main>
  );
}
