import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createId } from "../lib/id";
import { review } from "../lib/srs";
import {
  freshSeed,
  loadProgress,
  loadProfiles,
  loadTheme,
  loadVocab,
  saveActiveProfile,
  saveProgress,
  saveProfiles,
  saveTheme,
  saveVocab,
  type ThemeChoice,
} from "../lib/storage";
import type { Profile, ProgressMap, Vocab, VocabInput } from "../types";

type StoreValue = {
  vocab: Vocab[];
  profiles: Profile[];
  activeProfileId: string;
  progress: ProgressMap;
  theme: ThemeChoice;
  storageWarning: string | null;
  toggleTheme: () => void;
  setActiveProfile: (id: string) => void;
  addProfile: (name: string) => void;
  deleteProfile: (id: string) => void;
  addVocab: (input: VocabInput) => Vocab;
  updateVocab: (id: string, input: VocabInput) => void;
  deleteVocab: (id: string) => void;
  importVocab: (rows: VocabInput[], mode: "append" | "replace") => void;
  reloadSeed: () => void;
  recordAnswer: (profileId: string, vocabId: string, correct: boolean) => void;
};

const StoreContext = createContext<StoreValue | null>(null);
const STORAGE_WARNING = "Der Browser hat das Speichern blockiert. Der Fortschritt bleibt nur bis zum Neuladen erhalten.";

function pruneProgress(progress: ProgressMap, ids: Set<string>): ProgressMap {
  const next: ProgressMap = {};
  for (const [profileId, entries] of Object.entries(progress)) {
    next[profileId] = {};
    for (const [vocabId, entry] of Object.entries(entries)) {
      if (ids.has(vocabId)) next[profileId][vocabId] = entry;
    }
  }
  return next;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [vocab, setVocab] = useState<Vocab[]>(() => loadVocab());
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles().profiles);
  const [activeProfileId, setActiveProfileId] = useState(() => loadProfiles().activeId);
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function note(saved: boolean) {
    if (!saved) setStorageWarning(STORAGE_WARNING);
  }

  const value: StoreValue = {
    vocab,
    profiles,
    activeProfileId,
    progress,
    theme,
    storageWarning,
    toggleTheme() {
      setTheme((current) => {
        const next = current === "dark" ? "light" : "dark";
        note(saveTheme(next));
        document.documentElement.classList.toggle("dark", next === "dark");
        return next;
      });
    },
    setActiveProfile(id) {
      if (!profiles.some((profile) => profile.id === id)) return;
      setActiveProfileId(id);
      note(saveActiveProfile(id));
    },
    addProfile(name) {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      const profile = { id: createId("profile"), name: trimmed };
      const next = [...profiles, profile];
      setProfiles(next);
      setActiveProfileId(profile.id);
      note(saveProfiles(next) && saveActiveProfile(profile.id));
    },
    deleteProfile(id) {
      if (profiles.length <= 1) return;
      const next = profiles.filter((profile) => profile.id !== id);
      const active = activeProfileId === id ? next[0]?.id ?? "default" : activeProfileId;
      setProfiles(next);
      setActiveProfileId(active);
      setProgress((current) => {
        const copy = { ...current };
        delete copy[id];
        note(saveProgress(copy));
        return copy;
      });
      note(saveProfiles(next) && saveActiveProfile(active));
    },
    addVocab(input) {
      const created = { ...input, id: createId("user") };
      const next = [...vocab, created];
      setVocab(next);
      note(saveVocab(next));
      return created;
    },
    updateVocab(id, input) {
      const next = vocab.map((item) => (item.id === id ? { ...item, ...input } : item));
      setVocab(next);
      note(saveVocab(next));
    },
    deleteVocab(id) {
      const nextVocab = vocab.filter((item) => item.id !== id);
      setVocab(nextVocab);
      setProgress((current) => {
        const pruned = pruneProgress(current, new Set(nextVocab.map((item) => item.id)));
        note(saveProgress(pruned));
        return pruned;
      });
      note(saveVocab(nextVocab));
    },
    importVocab(rows, mode) {
      const created = rows.map((row) => ({ ...row, id: createId("csv") }));
      const nextVocab = mode === "replace" ? created : [...vocab, ...created];
      setVocab(nextVocab);
      note(saveVocab(nextVocab));
      if (mode === "replace") {
        setProgress((current) => {
          const pruned = pruneProgress(current, new Set(nextVocab.map((item) => item.id)));
          note(saveProgress(pruned));
          return pruned;
        });
      }
    },
    reloadSeed() {
      const seed = freshSeed();
      setVocab(seed);
      note(saveVocab(seed));
      setProgress((current) => {
        const pruned = pruneProgress(current, new Set(seed.map((item) => item.id)));
        note(saveProgress(pruned));
        return pruned;
      });
    },
    recordAnswer(profileId, vocabId, correct) {
      setProgress((current) => {
        const entry = review(current[profileId]?.[vocabId], correct);
        const next = {
          ...current,
          [profileId]: { ...(current[profileId] ?? {}), [vocabId]: entry },
        };
        note(saveProgress(next));
        return next;
      });
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Die App-Daten sind nicht geladen.");
  return value;
}
