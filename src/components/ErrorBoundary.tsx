import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { message: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return { message };
  }

  render() {
    if (this.state.message) {
      return (
        <main className="mx-auto max-w-xl px-4 py-10">
          <h1 className="text-2xl font-semibold">Etwas ist schiefgelaufen</h1>
          <p className="mt-3 text-stone-600 dark:text-stone-300">{this.state.message}</p>
          <button
            type="button"
            className="mt-6 min-h-12 rounded-xl bg-teal-800 px-4 font-semibold text-white"
            onClick={() => window.location.assign("/")}
          >
            Zur Startseite
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
