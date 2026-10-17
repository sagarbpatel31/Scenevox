import type { SceneTake } from "@/lib/scene-document";

export function TakeComparison({
  takes,
  currentText,
  onPreview,
  onRestore,
}: {
  takes: SceneTake[];
  currentText: string;
  onPreview: (take: SceneTake) => void;
  onRestore: (take: SceneTake) => void;
}) {
  if (!takes.length)
    return (
      <p className="empty-takes">
        Save a take to compare different deliveries.
      </p>
    );
  const recent = takes.slice(-4).reverse();
  return (
    <div className="takes-list" aria-label="Saved takes">
      {recent.map((take, index) => (
        <article className="take-card" key={take.id}>
          <div className="take-heading">
            <span>
              {take.source === "Original"
                ? "Original"
                : `${take.source} ${takes.length - index}`}
            </span>
            {take.text === currentText ? (
              <span className="current-take">Current text</span>
            ) : null}
          </div>
          <p>{take.text}</p>
          <em>{take.direction}</em>
          <div className="take-actions">
            <button
              type="button"
              onClick={() => onPreview(take)}
              aria-label={`Audition ${take.source.toLowerCase()} take`}
            >
              ▷ Audition
            </button>
            <button type="button" onClick={() => onRestore(take)}>
              Use this take ↗
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
