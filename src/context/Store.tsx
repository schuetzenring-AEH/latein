import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createId } from "../lib/id";
import { applyArenaResult, freshArenaRun, openStation } from "../lib/arena";
import { clearedAfterSuccess, planetById, planetIndex } from "../lib/planets";
import { hashPassword, nameKey } from "../lib/password";
import { completeVocab, plainLatin } from "../lib/vocab";
import { addDay, localDay, mergeDays, type DayLogMap } from "../lib/daylog";
import { dueAfter, review } from "../lib/srs";
import { findRemoteAccount, flushStats, scheduleStatsPush, type RemoteAccount } from "../lib/sync";
import {
  freshSeed,
  GUEST_PROFILE_ID,
  loadDayLog,
  loadMistakes,
  loadPlayState,
  loadProgress,
  loadTheme,
  loadVocab,
  saveActiveProfile,
  saveDayLog,
  saveMistakes,
  saveProgress,
  saveProfiles,
  saveSession,
  saveTheme,
  saveVocab,
  withGuest,
  type PlayMode,
  type ThemeChoice,
} from "../lib/storage";
import type { Mistake, Profile, ProgressEntry, ProgressMap, Vocab, VocabInput } from "../types";

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
  recordAnswer: (profileId: string, vocabId: string, correct: boolean, detail?: Omit<Mistake, "at" | "profileId" | "vocabId">) => void;
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
  const [mistakes, setMistakes] = useState<Mistake[]>(() => loadMistakes());
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const profilesRef = useRef(profiles);
  const progressRef = useRef(progress);
  const vocabRef = useRef(vocab);
  const mistakesRef = useRef(mistakes);
  const daylogRef = useRef<DayLogMap>(loadDayLog());
  const playModeRef = useRef(playMode);
  const activeIdRef = useRef(activeProfileId);
  profilesRef.current = profiles;
  progressRef.current = progress;
  vocabRef.current = vocab;
  mistakesRef.current = mistakes;
  playModeRef.current = playMode;
  activeIdRef.current = activeProfileId;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const profile = profilesRef.current.find((item) => item.id === activeProfileId);
    const run = profile?.arenaRun;
    if (playMode !== "named" || !profile?.passwordHash || !run) return;
    if ((profile.arenasCleared ?? 0) !== planetIndex(run.planetId)) return;
    const planet = planetById(run.planetId);
    if (!planet) return;
    const nextRun = openStation(run, planet, vocab);
    if (nextRun.lessonIndex === run.lessonIndex && nextRun.station === run.station) return;
    setProfiles((current) => {
      let changed = false;
      const next = current.map((item) => {
        if (item.id !== profile.id || !item.arenaRun || item.arenaRun.planetId !== run.planetId) return item;
        if (item.arenaRun.lessonIndex === nextRun.lessonIndex && item.arenaRun.station === nextRun.station) return item;
        changed = true;
        return { ...item, arenaRun: { ...item.arenaRun, lessonIndex: nextRun.lessonIndex, station: nextRun.station } };
      });
      if (!changed) return current;
      profilesRef.current = next;
      note(saveProfiles(next));
      return next;
    });
  }, [vocab, activeProfileId, playMode]);

  function readStats() {
    return {
      profiles: profilesRef.current,
      progress: progressRef.current,
      vocab: vocabRef.current,
      mistakes: mistakesRef.current,
      days: daylogRef.current,
    };
  }

  function rememberDay(profileId: string, add: { seconds?: number; words?: number; correct?: number; wrong?: number }) {
    const next = addDay(loadDayLog(), profileId, localDay(), add);
    daylogRef.current = next;
    note(saveDayLog(next));
    scheduleStatsPush(readStats);
  }

  useEffect(() => {
    scheduleStatsPush(readStats);
  }, [profiles, progress, vocab, mistakes]);

  useEffect(() => {
    const send = () => {
      void flushStats();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };
    window.addEventListener("pagehide", send);
    document.addEventListener("visibilitychange", onHide);
    let lastInput = Date.now();
    let lastTick = Date.now();
    const mark = () => {
      lastInput = Date.now();
    };
    window.addEventListener("pointerdown", mark);
    window.addEventListener("keydown", mark);
    const clock = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.round((now - lastTick) / 1000);
      lastTick = now;
      if (elapsed <= 0) return;
      if (document.visibilityState !== "visible") return;
      if (playModeRef.current === "gate") return;
      if (now - lastInput > 5 * 60 * 1000) return;
      const profileId = activeIdRef.current;
      if (!profileId) return;
      rememberDay(profileId, { seconds: Math.min(elapsed, 15) });
    }, 5000);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener("pagehide", send);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  function note(saved: boolean) {
    if (!saved) setStorageWarning(STORAGE_WARNING);
  }

  function exitToGate() {
    setPlayMode("gate");
    note(saveSession(null));
  }

  function adoptRemoteAccount(copy: Extract<RemoteAccount, { status: "match" }>["profile"], hash: string) {
    const already = profilesRef.current.find((profile) => profile.id === copy.id);
    if (already) {
      if (already.passwordHash !== hash) return;
      setActiveProfileId(already.id);
      setPlayMode("named");
      note(saveActiveProfile(already.id) && saveSession({ mode: "named", profileId: already.id }));
      return;
    }
    const profile: Profile = {
      id: copy.id,
      name: copy.name,
      passwordHash: hash,
      arenasCleared: copy.arenasCleared,
      ...(copy.arenaRun ? { arenaRun: copy.arenaRun } : {}),
    };
    const nextProfiles = [...profilesRef.current, profile];
    const entries: Record<string, ProgressEntry> = { ...(progressRef.current[copy.id] ?? {}) };
    for (const word of copy.words) {
      const box = word.box >= 1 && word.box <= 5 ? Math.floor(word.box) : 1;
      const updatedAt = word.updatedAt || new Date().toISOString();
      const incoming: ProgressEntry = {
        correct: Math.max(0, word.correct),
        wrong: Math.max(0, word.wrong),
        box,
        nextDue: dueAfter(box, updatedAt),
        updatedAt,
      };
      const current = entries[word.id];
      entries[word.id] = current
        ? {
          correct: Math.max(current.correct, incoming.correct),
          wrong: Math.max(current.wrong, incoming.wrong),
          box: incoming.updatedAt >= current.updatedAt ? incoming.box : current.box,
          nextDue: incoming.updatedAt >= current.updatedAt ? incoming.nextDue : current.nextDue,
          updatedAt: incoming.updatedAt >= current.updatedAt ? incoming.updatedAt : current.updatedAt,
        }
        : incoming;
    }
    const nextProgress = { ...progressRef.current, [copy.id]: entries };
    const seen = new Set<string>();
    const mine = [...mistakesRef.current.filter((item) => item.profileId === copy.id), ...copy.mistakes].filter((item) => {
      const key = `${item.at}|${item.vocabId}|${item.given}|${item.expected}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(-300);
    const nextMistakes = [...mistakesRef.current.filter((item) => item.profileId !== copy.id), ...mine];
    const nextDays = { ...daylogRef.current, [copy.id]: mergeDays(daylogRef.current[copy.id] ?? [], copy.days) };
    profilesRef.current = nextProfiles;
    progressRef.current = nextProgress;
    mistakesRef.current = nextMistakes;
    daylogRef.current = nextDays;
    setProfiles(nextProfiles);
    setProgress(nextProgress);
    setMistakes(nextMistakes);
    setActiveProfileId(copy.id);
    setPlayMode("named");
    note(
      saveProfiles(nextProfiles)
      && saveActiveProfile(copy.id)
      && saveSession({ mode: "named", profileId: copy.id })
      && saveProgress(nextProgress)
      && saveMistakes(nextMistakes)
      && saveDayLog(daylogRef.current),
    );
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
      const remote = await findRemoteAccount(trimmed, hash);
      if (remote.status === "match" || remote.status === "wrong" || remote.status === "unconfirmed") {
        return "Dieser Name ist schon vergeben. Bitte anmelden.";
      }
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
      let hash: string;
      try {
        hash = await hashPassword(password);
      } catch {
        return "Das Passwort konnte hier nicht geprüft werden.";
      }
      const match = profilesRef.current.find((profile) => profile.id !== GUEST_PROFILE_ID && nameKey(profile.name) === nameKey(trimmed));
      if (match) {
        if (!match.passwordHash) return "Für diesen Namen fehlt noch ein Passwort.";
        if (hash !== match.passwordHash) return "Das Passwort stimmt nicht.";
        setActiveProfileId(match.id);
        setPlayMode("named");
        note(saveActiveProfile(match.id) && saveSession({ mode: "named", profileId: match.id }));
        return null;
      }
      const remote = await findRemoteAccount(trimmed, hash);
      if (remote.status === "match") {
        adoptRemoteAccount(remote.profile, hash);
        return null;
      }
      if (remote.status === "wrong") return "Das Passwort stimmt nicht.";
      if (remote.status === "unconfirmed") return "Dieser Name liegt auf einem anderen Gerät. Öffne dort einmal die Seite, dann klappt die Anmeldung hier.";
      if (remote.status === "unavailable") return "Die Anmeldung ist gerade nicht erreichbar. Auf diesem Gerät gibt es den Namen noch nicht.";
      return "Diesen Namen gibt es hier noch nicht.";
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
          const saved = profile.arenaRun?.planetId === planetId ? profile.arenaRun : freshArenaRun(planetId);
          const run = openStation(saved, planet, vocab);
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
              latein: plainLatin(input.latein),
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
    recordAnswer(profileId, vocabId, correct, detail) {
      rememberDay(profileId, correct ? { words: 1, correct: 1 } : { words: 1, wrong: 1 });
      setProgress((current) => {
        const entry = review(current[profileId]?.[vocabId], correct);
        const next = {
          ...current,
          [profileId]: { ...(current[profileId] ?? {}), [vocabId]: entry },
        };
        note(saveProgress(next));
        return next;
      });
      if (correct || !detail) return;
      setMistakes((current) => {
        const next = [...current, {
          at: new Date().toISOString(),
          profileId,
          vocabId,
          prompt: detail.prompt,
          given: detail.given,
          expected: detail.expected,
          mode: detail.mode,
          ...(detail.station ? { station: detail.station } : {}),
        }].slice(-300);
        note(saveMistakes(next));
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
