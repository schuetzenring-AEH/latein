import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field } from "../components/ui";
import { useStore } from "../context/Store";

type Panel = "choose" | "login" | "register";

const LOCAL_NOTE = "Name und Passwort bleiben nur auf diesem Gerät. Das Passwort wird nicht im Klartext gespeichert.";

export function GatePage() {
  const store = useStore();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>("choose");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function playFree() {
    store.enterGuest();
    navigate("/");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const message = panel === "register"
      ? await store.registerAccount(name, password)
      : await store.loginAccount(name, password);
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    setPassword("");
    navigate("/planeten");
  }

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-semibold tracking-tight">Latein</p>
          <button
            type="button"
            className="inline-flex min-h-12 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold dark:border-stone-700 dark:bg-stone-900"
            onClick={store.toggleTheme}
          >
            {store.theme === "dark" ? "Hell" : "Dunkel"}
          </button>
        </div>
        <section>
          <h1 lang="la" className="text-2xl font-semibold tracking-tight sm:text-3xl">Repetitio est mater studiorum</h1>
          <p className="mt-3 text-xl font-semibold tracking-tight">Wie willst du spielen?</p>
          <p className="mt-2 text-stone-600 dark:text-stone-300">
            Frei spielen geht ohne Konto. Mit Namen schaltest du den Planetenpfad frei.
          </p>
          {panel === "choose" && (
            <div className="mt-6 grid gap-3">
              <Button className="w-full" onClick={playFree}>Frei spielen</Button>
              <Button variant="secondary" className="w-full" onClick={() => { setPanel("login"); setError(null); }}>Mit Namen</Button>
            </div>
          )}
          {panel !== "choose" && (
            <form onSubmit={submit} className="mt-6 grid gap-4">
              <Field
                id="account-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="username"
                maxLength={40}
                required
                spellCheck={false}
              />
              <Field
                id="account-password"
                label="Passwort"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={panel === "register" ? "new-password" : "current-password"}
                required
              />
              <p className="text-sm text-stone-600 dark:text-stone-300">{LOCAL_NOTE}</p>
              {error && <p className="text-sm text-red-800 dark:text-red-300" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {panel === "register" ? "Namen anlegen" : "Anmelden"}
              </Button>
              <div className="flex flex-wrap gap-2">
                {panel === "login" ? (
                  <Button type="button" variant="ghost" onClick={() => { setPanel("register"); setError(null); }}>
                    Noch kein Name? Anlegen
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={() => { setPanel("login"); setError(null); }}>
                    Ich habe schon einen Namen
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => { setPanel("choose"); setError(null); }}>
                  Zurück
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
