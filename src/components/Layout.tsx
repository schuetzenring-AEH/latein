import { useState, type FormEvent, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useStore } from "../context/Store";
import { Button, cx } from "./ui";

const links = [
  { to: "/", label: "Üben" },
  { to: "/statistik", label: "Statistik" },
  { to: "/woerter", label: "Wörter" },
];

function linkActive(path: string, current: string): boolean {
  if (path === "/") return current === "/" || current.startsWith("/quiz");
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
  const active = store.profiles.find((profile) => profile.id === store.activeProfileId);

  function createProfile(event: FormEvent) {
    event.preventDefault();
    store.addProfile(name);
    setName("");
    setAdding(false);
  }

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 bg-stone-100/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold tracking-tight">Latein</p>
            <nav className="hidden gap-1 md:flex" aria-label="Bereiche">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} className={() => navClass(linkActive(link.to, location.pathname))}>
                  {link.label}
                </NavLink>
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="profile" className="mb-1 block text-sm font-medium">Profil</label>
              <select
                id="profile"
                className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900"
                value={store.activeProfileId}
                onChange={(event) => store.setActiveProfile(event.target.value)}
              >
                {store.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </div>
            <Button variant="secondary" onClick={() => setAdding((open) => !open)}>Neu</Button>
            {store.profiles.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (!active) return;
                  if (window.confirm(`Profil „${active.name}“ löschen? Der Lernstand dieses Profils geht verloren.`)) {
                    store.deleteProfile(active.id);
                  }
                }}
              >
                Löschen
              </Button>
            )}
          </div>
          {adding && (
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
          {store.storageWarning && (
            <p className="text-sm text-red-800 dark:text-red-300" role="status">{store.storageWarning}</p>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 md:pb-12">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex gap-1 border-t border-stone-200 bg-stone-100/95 px-2 pt-1 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95 md:hidden"
        style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
        aria-label="Bereiche"
      >
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={() => navClass(linkActive(link.to, location.pathname), true)}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
