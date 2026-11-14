import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createId } from "../lib/id";
import { applyArenaResult, freshArenaRun } from "../lib/arena";
import { clearedAfterSuccess, planetById, planetIndex } from "../lib/planets";
import { hashPassword, nameKey } from "../lib/password";
import { completeVocab } from "../lib/vocab";
import { review } from "../lib/srs";
import {
  freshSeed,
  GUEST_PROFILE_ID,
  loadPlayState,
  loadProgress,
  loadTheme,
  loadVocab,
  saveActiveProfile,
  saveProgress,
  saveProfiles,
  saveSession,
  saveTheme,
  saveVocab,
  withGuest,
  type PlayMode,
  type ThemeChoice,
} from "../lib/storage";
import type { Profile, ProgressMap, Vocab, VocabInput } from "../types";

type StoreValue = {
  vocab: Vocab[];
  profiles: Profile[];
  activeProfileId: string;
  playMode: PlayMode;
  progress: ProgressMap;
  theme: ThemeChoice;
  storageWarning: string | null;
  toggleTheme: () => void;
  setActiveProfile: (id: string) => void;
  addProfile: (name: string) => boolean;
  deleteProfile: (id: string) => void;
  enterGuest: () => void;
  leaveToGate: () => void;
  registerAccount: (name: string, password: string) => Promise<string | null>;
  loginAccount: (name: string, password: string) => Promise<string | null>;
  logout: () => void;
  completeArena: (arenaId: string) => void;
  ensureArenaRun: (planetId: string) => void;
  recordArenaResult: (planetId: string, missedIds: readonly string[], passed: boolean) => void;
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

function nameTaken(profiles: readonly Profile[], name: string): boolean {
  const key = nameKey(name);
  return profiles.some((profile) => profile.id !== GUEST_PROFILE_ID && nameKey(profile.name) === key);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(loadPlayState);
  const [vocab, setVocab] = useState<Vocab[]>(() => loadVocab());
  const [profiles, setProfiles] = useState<Profile[]>(boot.profiles);
  const [activeProfileId, setActiveProfileId] = useState(boot.activeId);
  const [playMode, setPlayMode] = useState<PlayMode>(boot.playMode);
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function note(saved: boolean) {
    if (!saved) setStorageWarning(STORAGE_WARNING);
  }

  function exitToGate() {
    setPlayMode("gate");
    note(saveSession(null));
  }

  const value: StoreValue = {
    vocab,
    profiles,
    activeProfileId,
    playMode,
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
      if (playMode === "named") return;
      const profile = profiles.find((item) => item.id === id);
      if (!profile || profile.passwordHash) return;
      setActiveProfileId(id);
      note(saveActiveProfile(id));
    },
    addProfile(name) {
      if (playMode !== "guest") return false;
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed || nameTaken(profiles, trimmed)) return false;
      const profile = { id: createId("profile"), name: trimmed };
      const next = [...profiles, profile];
      profilesRef.current = next;
      setProfiles(next);
      setActiveProfileId(profile.id);
      note(saveProfiles(next) && saveActiveProfile(profile.id));
      return true;
    },
    deleteProfile(id) {
      if (playMode !== "guest") return;
      const target = profiles.find((profile) => profile.id === id);
      if (!target || target.passwordHash) return;
      const free = profiles.filter((profile) => !profile.passwordHash);
      if (free.length <= 1) return;
      const next = profiles.filter((profile) => profile.id !== id);
      const freeNext = next.filter((profile) => !profile.passwordHash);
      const active = activeProfileId === id ? freeNext[0]?.id ?? GUEST_PROFILE_ID : activeProfileId;
      profilesRef.current = next;
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
    enterGuest() {
      const next = withGuest(profilesRef.current);
      profilesRef.current = next;
      setProfiles(next);
      setActiveProfileId(GUEST_PROFILE_ID);
      setPlayMode("guest");
      note(saveProfiles(next) && saveActiveProfile(GUEST_PROFILE_ID) && saveSession({ mode: "guest" }));
    },
    leaveToGate: exitToGate,
    async registerAccount(name, password) {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return "Bitte einen Namen eingeben.";
      if (password.length === 0) return "Bitte ein Passwort eingeben.";
      let hash: string;
      try {
        hash = await hashPassword(password);
      } catch {
        return "Das Passwort konnte hier nicht gespeichert werden.";
      }
      const current = profilesRef.current;
      const existing = current.find((profile) => profile.id !== GUEST_PROFILE_ID && nameKey(profile.name) === nameKey(trimmed));
      if (existing?.passwordHash) return "Dieser Name ist schon vergeben.";
      const id = existing?.id ?? createId("profile");
      const next = existing
        ? current.map((profile) => (
          profile.id === id
            ? { ...profile, passwordHash: hash, arenasCleared: profile.arenasCleared ?? 0 }
            : profile
        ))
        : [...current, { id, name: trimmed, passwordHash: hash, arenasCleared: 0 }];
      profilesRef.current = next;
      setProfiles(next);
      setActiveProfileId(id);
      setPlayMode("named");
      note(saveProfiles(next) && saveActiveProfile(id) && saveSession({ mode: "named", profileId: id }));
      return null;
    },
    async loginAccount(name, password) {
      const trimmed = name.trim();
      if (!trimmed || password.length === 0) return "Bitte Name und Passwort eingeben.";
      const match = profilesRef.current.find((profile) => profile.id !== GUEST_PROFILE_ID && nameKey(profile.name) === nameKey(trimmed));
      if (!match) return "Diesen Namen gibt es hier noch nicht.";
      if (!match.passwordHash) return "Für diesen Namen fehlt noch ein Passwort.";
      let hash: string;
      try {
        hash = await hashPassword(password);
      } catch {
        return "Das Passwort konnte hier nicht geprüft werden.";
      }
      if (hash !== match.passwordHash) return "Das Passwort stimmt nicht.";
      setActiveProfileId(match.id);
      setPlayMode("named");
      note(saveActiveProfile(match.id) && saveSession({ mode: "named", profileId: match.id }));
      return null;
    },
    logout: exitToGate,
    completeArena(arenaId) {
      if (playMode !== "named") return;
      const index = planetIndex(arenaId);
      if (index < 0) return;
      const profileId = activeProfileId;
      setProfiles((current) => {
        let changed = false;
        const next = current.map((profile) => {
          if (profile.id !== profileId || !profile.passwordHash) return profile;
          const cleared = profile.arenasCleared ?? 0;
          const advanced = clearedAfterSuccess(cleared, index);
          if (advanced === cleared) return profile;
          changed = true;
          return { ...profile, arenasCleared: advanced, arenaRun: undefined };
        });
        if (!changed) return current;
        profilesRef.current = next;
        note(saveProfiles(next));
        return next;
      });
    },
    ensureArenaRun(planetId) {
      if (playMode !== "named") return;
      const index = planetIndex(planetId);
      if (index < 0) return;
      const profileId = activeProfileId;
      setProfiles((current) => {
        let changed = false;
        const next = current.map((profile) => {
          if (profile.id !== profileId || !profile.passwordHash) return profile;
          if ((profile.arenasCleared ?? 0) !== index) return profile;
          if (profile.arenaRun?.planetId === planetId) return profile;
          changed = true;
          return { ...profile, arenaRun: freshArenaRun(planetId) };
        });
        if (!changed) return current;
        profilesRef.current = next;
        note(saveProfiles(next));
        return next;
      });
    },
    recordArenaResult(planetId, missedIds, passed) {
      if (playMode !== "named") return;
      const planet = planetById(planetId);
      const index = planetIndex(planetId);
      if (!planet || index < 0) return;
      const profileId = activeProfileId;
      setProfiles((current) => {
        let changed = false;
        const next = current.map((profile) => {
          if (profile.id !== profileId || !profile.passwordHash) return profile;
          if ((profile.arenasCleared ?? 0) !== index) return profile;
          const run = profile.arenaRun?.planetId === planetId ? profile.arenaRun : freshArenaRun(planetId);
          const result = applyArenaResult(run, planet, vocab, missedIds, passed);
          changed = true;
          if (result === "clear") {
            return { ...profile, arenasCleared: clearedAfterSuccess(profile.arenasCleared ?? 0, index), arenaRun: undefined };
          }
          return { ...profile, arenaRun: result };
        });
        if (!changed) return current;
        profilesRef.current = next;
        note(saveProfiles(next));
        return next;
      });
    },
    addVocab(input) {
      const created = completeVocab({ ...input, id: createId("user") });
      const next = [...vocab, created];
      setVocab(next);
      note(saveVocab(next));
      return created;
    },
    updateVocab(id, input) {
      const next = vocab.map((item) => (
        item.id === id
          ? {
              ...item,
              lektion: input.lektion,
              latein: input.latein,
              deutsch: input.deutsch,
              wortart: input.wortart ?? item.wortart,
              cluster: input.cluster ?? item.cluster,
            }
          : item
      ));
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
      const created = rows.map((row) => completeVocab({ ...row, id: createId("csv") }));
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
