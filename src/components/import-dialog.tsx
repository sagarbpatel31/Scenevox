"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseScript,
  validateScene,
  type SceneDocument,
} from "@/lib/scene-document";

export function ImportDialog({
  onImport,
  onClose,
}: {
  onImport: (scene: SceneDocument) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("My first scene");
  const [script, setScript] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const importText = () => {
    try {
      onImport(parseScript(script, title));
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not import this script.",
      );
    }
  };
  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      onCancel={onClose}
      aria-labelledby="import-title"
    >
      <div className="dialog-heading">
        <div>
          <p className="kicker">Start with your story</p>
          <h2 id="import-title">Bring a script to life.</h2>
        </div>
        <button
          type="button"
          className="text-button"
          aria-label="Close import"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <p className="dialog-description">
        Paste dialogue with speaker names. Characters and acting notes are
        detected automatically. Your current scene will be replaced; export it
        first if you want to keep it.
      </p>
      <label htmlFor="import-scene-title">Scene title</label>
      <input
        id="import-scene-title"
        value={title}
        maxLength={80}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="import-script">Script</label>
      <textarea
        id="import-script"
        value={script}
        onChange={(event) => setScript(event.target.value)}
        maxLength={30_000}
        rows={9}
        placeholder={
          "MARA: (quiet urgency) Orion, dim the lights.\nORION: Of course, Commander.\n\nOr use uppercase screenplay character cues."
        }
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dialog-actions">
        <label className="file-button">
          Open SceneVox JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 200_000)
                  throw new Error("Scene files must be smaller than 200 KB.");
                onImport(validateScene(JSON.parse(await file.text())));
                onClose();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Invalid scene file.",
                );
              }
            }}
          />
        </label>
        <button
          type="button"
          className="primary-button"
          onClick={importText}
          disabled={!script.trim()}
        >
          Import script ↗
        </button>
      </div>
    </dialog>
  );
}
