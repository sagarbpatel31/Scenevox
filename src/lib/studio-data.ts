export type Character = {
  id: string;
  name: string;
  role: string;
  color: string;
  voiceHint: "warm" | "bright" | "grounded";
};

export type ScriptLine = {
  id: string;
  characterId: string;
  text: string;
  direction: string;
};

export const characters: Character[] = [
  {
    id: "mara",
    name: "Mara Venn",
    role: "Mission commander",
    color: "#ff8d6b",
    voiceHint: "grounded",
  },
  {
    id: "orion",
    name: "Orion",
    role: "Ship intelligence",
    color: "#b6ef5b",
    voiceHint: "bright",
  },
];

export const initialLines: ScriptLine[] = [
  {
    id: "line-1",
    characterId: "mara",
    direction: "quiet urgency",
    text: "Orion, dim every light except the garden ring.",
  },
  {
    id: "line-2",
    characterId: "orion",
    direction: "gentle, precise",
    text: "Done. The last sunrise will reach the seedlings in forty-two seconds.",
  },
  {
    id: "line-3",
    characterId: "mara",
    direction: "a smile through fear",
    text: "Then let them think morning is still coming.",
  },
  {
    id: "line-4",
    characterId: "orion",
    direction: "a beat, then warm",
    text: "Mara, for what it is worth, they are not the only ones.",
  },
];

export const directionOptions = [
  "quiet urgency",
  "gentle, precise",
  "barely holding back",
  "a smile through fear",
  "warmly conspiratorial",
];
