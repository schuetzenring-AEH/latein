import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useStore } from "../context/Store";
import { Button, cx } from "./ui";

function linkActive(path: string, current: string, inArena: boolean): boolean {
  if (path === "/planeten") return current === "/planeten" || current === "/arena" || inArena;
  if (path === "/") {
    if (inArena) return false;
    return current === "/" || current.startsWith("/quiz") || current.startsWith("/weltraum");
  }
  return current === path || current.startsWith(`${path}/`);
}

function navClass(active: boolean, block = false): string {
  return cx(
    "inline-flex min-h-12 items-center justify-center rounded-xl px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
    block && "flex-1",
    active
      ? "bg-teal-800 text-white dark:bg-teal-500 dark:text-stone-950"
      : "text-stone-700 hover:bg-stone-200/70 dark:text-stone-200 dark:hover:bg-stone-800",
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const store = useStore();
  const location = useLocation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const named = store.playMode === "named";
  const active = store.profiles.find((profile) => profile.id === store.activeProfileId);
  const freeProfiles = store.profiles.filter((profile) => !profile.passwordHash);
  const playing = location.pathname === "/weltraum";
  const arenaState = location.state as { arena?: { arenaId?: unknown }; arenaId?: unknown } | null;
  const inArena = location.pathname === "/arena"
    || ((location.pathname === "/weltraum" || location.pathname === "/quiz")
      && (typeof arenaState?.arena?.arenaId === "string" || typeof arenaState?.arenaId === "string"));
  const links = [
    { to: "/", label: "Üben" },
    ...(named ? [{ to: "/planeten", label: "Planetenpfad" }] : []),
    { to: "/statistik", label: "Statistik" },
    { to: "/woerter", label: "Wörter" },
  ];

  function createProfile(event: FormEvent) {
    event.preventDefault();
    if (!store.addProfile(name)) {
      setProfileError(name.trim() ? "Dieser Name ist schon vergeben." : "Bitte einen Namen eingeben.");
      return;
    }
    setProfileError(null);
    setName("");
    setAdding(false);
  }

  return (
    <div className={cx(
      "bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100",
      playing ? "flex h-dvh flex-col overflow-hidden" : "min-h-dvh",
    )}>
      <header className="shrink-0 border-b border-stone-200 bg-stone-100/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold tracking-tight">Latein</p>
            <nav className="hidden gap-1 md:flex" aria-label="Bereiche">
              {links.map((link) => (
                <Link key={link.to} to={link.to} aria-current={linkActive(link.to, location.pathname, inArena) ? "page" : undefined} className={navClass(linkActive(link.to, location.pathname, inArena))}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              className="inline-flex min-h-12 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold dark:border-stone-700 dark:bg-stone-900"
              onClick={store.toggleTheme}
            >
              {store.theme === "dark" ? "Hell" : "Dunkel"}
            </button>
          </div>
          {named ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Angemeldet als <span className="font-semibold">{active?.name ?? "…"}</span></p>
              <Button variant="secondary" onClick={store.logout}>Abmelden</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="profile" className="mb-1 block text-sm font-medium">Profil</label>
                <select
                  id="profile"
                  className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900"
                  value={freeProfiles.some((profile) => profile.id === store.activeProfileId) ? store.activeProfileId : freeProfiles[0]?.id ?? ""}
                  onChange={(event) => store.setActiveProfile(event.target.value)}
                >
                  {freeProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" onClick={() => { setAdding((open) => !open); setProfileError(null); }}>Neu</Button>
              {freeProfiles.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!active || active.passwordHash) return;
                    if (window.confirm(`Profil „${active.name}“ löschen? Der Lernstand dieses Profils geht verloren.`)) {
                      store.deleteProfile(active.id);
                    }
                  }}
                >
                  Löschen
                </Button>
              )}
              <Button variant="ghost" onClick={store.leaveToGate}>Spielwahl</Button>
            </div>
          )}
          {!named && adding && (
            <form onSubmit={createProfile} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="new-profile" className="mb-1 block text-sm font-medium">Name des Profils</label>
                <input
                  id="new-profile"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950"
                  maxLength={40}
                  required
                />
              </div>
              <Button type="submit">Anlegen</Button>
            </form>
          )}
          {profileError && <p className="text-sm text-red-800 dark:text-red-300" role="alert">{profileError}</p>}
          {store.storageWarning && (
            <p className="text-sm text-red-800 dark:text-red-300" role="status">{store.storageWarning}</p>
          )}
        </div>
      </header>
      <main className={cx(
        "mx-auto w-full max-w-3xl",
        playing ? "flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2" : "px-4 pb-28 pt-5 md:pb-12",
      )}>{children}</main>
      <nav
        className={cx(
          "flex gap-1 border-t border-stone-200 bg-stone-100/95 px-2 pt-1 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95 md:hidden",
          playing ? "shrink-0" : "fixed inset-x-0 bottom-0 z-20",
        )}
        style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
        aria-label="Bereiche"
      >
        {links.map((link) => (
          <Link key={link.to} to={link.to} aria-current={linkActive(link.to, location.pathname, inArena) ? "page" : undefined} className={navClass(linkActive(link.to, location.pathname, inArena), true)}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
