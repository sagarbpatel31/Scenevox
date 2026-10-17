"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  DirectorSession,
  type DirectorLineContext,
  type DirectorRevision,
  type DirectorState,
} from "@/lib/voice-agent/director-session";

type Props = {
  context: DirectorLineContext;
  enabled: boolean;
  playing: boolean;
  onStart: () => void;
  onRevision: (revision: DirectorRevision, lineId: string) => void;
};

const labels: Record<DirectorState, string> = {
  idle: "Your next take starts here",
  connecting: "Opening the booth…",
  listening: "Listening to you",
  thinking: "Finding the right beat…",
  speaking: "Director is speaking",
  ending: "Closing the booth…",
  error: "Let’s try that again",
};

export function DirectorBooth({
  context,
  enabled,
  playing,
  onStart,
  onRevision,
}: Props) {
  const [state, setState] = useState<DirectorState>("idle");
  const [error, setError] = useState("");
  const [userText, setUserText] = useState("");
  const [agentText, setAgentText] = useState("");
  const [request, setRequest] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [applied, setApplied] = useState(0);
  const session = useRef<DirectorSession | null>(null);
  const pendingRequest = useRef("");
  const latestRevision = useRef(onRevision);
  const active = !["idle", "error"].includes(state);

  useEffect(() => {
    latestRevision.current = onRevision;
  }, [onRevision]);
  useEffect(() => {
    session.current?.updateContext(context);
  }, [context]);
  useEffect(() => {
    if (playing) session.current?.end();
  }, [playing]);
  useEffect(() => () => session.current?.dispose(), []);

  const start = async (microphone: boolean, typedRequest = "") => {
    onStart();
    session.current?.dispose();
    setError("");
    setAgentText("");
    setUserText("");
    setSessionId("");
    setLatency(null);
    pendingRequest.current = typedRequest;
    const nextSession = new DirectorSession({
      onState: setState,
      onError: setError,
      onTranscript: (speaker, text) =>
        speaker === "user" ? setUserText(text) : setAgentText(text),
      onRevision: (revision, lineId) => {
        latestRevision.current(revision, lineId);
        setApplied((count) => count + 1);
      },
      onLatency: setLatency,
      onSession: (id) => {
        setSessionId(id);
        if (pendingRequest.current) {
          const text = pendingRequest.current;
          pendingRequest.current = "";
          queueMicrotask(() => nextSession.requestDirection(text));
        }
      },
    });
    session.current = nextSession;
    await nextSession.connect(context, microphone);
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = request.trim();
    if (!text || !enabled) return;
    setRequest("");
    if (!active) void start(false, text);
    else if (!session.current?.requestDirection(text))
      setError("Wait for the connection to finish, then send your note again.");
  };

  return (
    <section
      className={`director-card ${active ? "active" : ""}`}
      aria-label="Director booth"
    >
      <div className="director-card-header">
        <div>
          <span className="director-kicker">AssemblyAI · Director’s booth</span>
          <strong role="status">{labels[state]}</strong>
        </div>
        <span className={`director-orb ${state}`} aria-hidden="true">
          ✦
        </span>
      </div>
      <p className="director-context">
        Directing line {String(context.lineNumber).padStart(2, "0")} ·{" "}
        {context.characterName}
      </p>
      {!agentText && !userText ? (
        <p className="director-intro">
          “She’s afraid, but hiding it.” Say what you want to change and hear
          the director’s take.
        </p>
      ) : null}
      <div className="director-conversation" aria-live="polite">
        {userText ? (
          <p>
            <strong>You</strong>
            {userText}
          </p>
        ) : null}
        {agentText ? (
          <p className="agent">
            <strong>Director</strong>
            {agentText}
          </p>
        ) : null}
        {error ? (
          <p className="director-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form className="director-form" onSubmit={send}>
        <label className="sr-only" htmlFor="director-note">
          Direction note
        </label>
        <input
          id="director-note"
          value={request}
          maxLength={500}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Or type a direction…"
          disabled={!enabled || state === "connecting" || state === "ending"}
        />
        <button
          type="submit"
          aria-label="Send direction"
          disabled={
            !enabled ||
            !request.trim() ||
            ["connecting", "ending", "thinking", "speaking"].includes(state)
          }
        >
          ↗
        </button>
      </form>
      <div className="director-actions">
        <span>
          {latency !== null
            ? `${(latency / 1000).toFixed(1)}s to first audio`
            : "Voice + text · 5 min per session"}
        </span>
        {active ? (
          <button
            type="button"
            className="director-button end"
            onClick={() => session.current?.end()}
            disabled={state === "ending"}
          >
            ■ End session
          </button>
        ) : (
          <button
            type="button"
            className="director-button"
            onClick={() => void start(true)}
            disabled={!enabled}
          >
            ◉ Talk to Director
          </button>
        )}
      </div>
      {applied ? (
        <p className="director-proof" role="status">
          ✓ {applied} {applied === 1 ? "revision" : "revisions"} saved to takes
        </p>
      ) : null}
      {sessionId ? (
        <details className="session-details">
          <summary>Session details</summary>
          <code>{sessionId}</code>
        </details>
      ) : null}
      {!enabled ? (
        <p className="director-intro">
          Live direction is available when AssemblyAI is configured.
        </p>
      ) : null}
    </section>
  );
}
