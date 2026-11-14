import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "../context/Store";
import { parseCsv } from "../lib/csv";
import { lessonNumbers, joinDeutsch, splitDeutsch } from "../lib/vocab";
import type { Vocab, VocabInput } from "../types";
import { Button, Field, SelectField, TextArea } from "../components/ui";

export function AdminPage() {
  const store = useStore();
  const lessons = useMemo(() => lessonNumbers(store.vocab), [store.vocab]);
  const [filter, setFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lektion, setLektion] = useState("");
  const [latein, setLatein] = useState("");
  const [deutsch, setDeutsch] = useState("");
  const [csvText, setCsvText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = store.vocab
    .filter((item) => filter === "all" || String(item.lektion) === filter)
    .slice()
    .sort((a, b) => a.lektion - b.lektion || a.latein.localeCompare(b.latein, "de"));

  function readForm(): VocabInput | null {
    const number = Number(lektion.trim());
    const latin = latein.trim();
    const german = splitDeutsch(deutsch);
    if (!Number.isInteger(number) || number < 1 || !latin || german.length === 0) {
      setError("Bitte Lektion, Latein und Deutsch ausfüllen. Die Lektion ist eine ganze Zahl ab 1.");
      setMessage(null);
      return null;
    }
    setError(null);
    return { lektion: number, latein: latin, deutsch: german };
  }

  function resetForm() {
    setEditingId(null);
    setLektion("");
    setLatein("");
    setDeutsch("");
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const input = readForm();
    if (!input) return;
    if (editingId) {
      store.updateVocab(editingId, input);
      setMessage("Wort gespeichert.");
    } else {
      const created = store.addVocab(input);
      setFilter(String(created.lektion));
      setMessage("Wort hinzugefügt.");
      window.setTimeout(() => document.getElementById(`vocab-${created.id}`)?.scrollIntoView({ block: "center" }), 0);
    }
    resetForm();
  }

  function startEdit(item: Vocab) {
    setEditingId(item.id);
    setLektion(String(item.lektion));
    setLatein(item.latein);
    setDeutsch(joinDeutsch(item.deutsch));
    setError(null);
    setMessage(null);
    window.scrollTo(0, 0);
  }

  function remove(item: Vocab) {
    if (!window.confirm(`„${item.latein}“ löschen?`)) return;
    store.deleteVocab(item.id);
    if (editingId === item.id) resetForm();
    setMessage("Wort gelöscht.");
    setError(null);
  }

  function importCsv(mode: "append" | "replace") {
    let parsed;
    try {
      parsed = parseCsv(csvText);
    } catch {
      setError("Die CSV-Datei konnte nicht gelesen werden.");
      setMessage(null);
      return;
    }
    if (parsed.empty) {
      setError("Die Eingabe ist leer.");
      setMessage(null);
      return;
    }
    if (parsed.rows.length === 0) {
      setError(`Keine gültigen Zeilen. Übersprungen: ${parsed.skipped}.`);
      setMessage(null);
      return;
    }
    if (mode === "replace" && !window.confirm("Vorhandene Wörter durch den Import ersetzen?")) return;
    store.importVocab(parsed.rows, mode);
    setMessage(`Importiert: ${parsed.rows.length}. Übersprungen: ${parsed.skipped}.`);
    setError(null);
    setCsvText("");
  }

  function reload() {
    if (!window.confirm("Alle Wörter durch die Beispieldaten ersetzen? Eigene Einträge gehen verloren.")) return;
    store.reloadSeed();
    setFilter("all");
    resetForm();
    setMessage("Beispieldaten geladen.");
    setError(null);
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === "string" ? reader.result : "");
      setError(null);
    };
    reader.onerror = () => {
      setError("Die Datei konnte nicht gelesen werden.");
      setMessage(null);
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Wörter</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-300">Vokabeln anlegen, ändern, löschen oder aus einer CSV-Datei übernehmen.</p>
      <div className="mt-4" role="status">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {message && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      </div>

      <form onSubmit={save} className="mt-4 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">{editingId ? "Wort ändern" : "Wort hinzufügen"}</h2>
        <Field id="vocab-lektion" label="Lektion" inputMode="numeric" value={lektion} onChange={(event) => setLektion(event.target.value)} />
        <Field id="vocab-latein" label="Latein" value={latein} onChange={(event) => setLatein(event.target.value)} />
        <Field id="vocab-deutsch" label="Deutsch" value={deutsch} onChange={(event) => setDeutsch(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{editingId ? "Speichern" : "Hinzufügen"}</Button>
          {editingId && <Button type="button" variant="secondary" onClick={resetForm}>Abbrechen</Button>}
        </div>
      </form>

      <div className="mt-4">
        <SelectField id="lesson-filter" label="Lektion filtern" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Alle Lektionen</option>
          {lessons.map((lektionNumber) => (
            <option key={lektionNumber} value={lektionNumber}>Lektion {lektionNumber}</option>
          ))}
        </SelectField>
      </div>

      <div className="mt-4 grid gap-3">
        {visible.length === 0 && <p className="text-stone-600 dark:text-stone-300">Keine Wörter in dieser Ansicht.</p>}
        {visible.map((item) => (
          <article key={item.id} id={`vocab-${item.id}`} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-sm text-stone-500 dark:text-stone-400">Lektion {item.lektion}</p>
            <p lang="la" className="mt-1 text-lg font-semibold [overflow-wrap:anywhere]">{item.latein}</p>
            <p className="[overflow-wrap:anywhere]">{joinDeutsch(item.deutsch)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => startEdit(item)}>Bearbeiten</Button>
              <Button variant="danger" onClick={() => remove(item)}>Löschen</Button>
            </div>
          </article>
        ))}
      </div>

      <details className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <summary className="cursor-pointer text-lg font-semibold">CSV importieren</summary>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">Trennzeichen ist das Semikolon. Kopfzeile optional: Lektion;Latein;Deutsch. Beispiel: 1;amicus;Freund</p>
        <div className="mt-3 grid gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="csv-file" className="text-sm font-medium">CSV-Datei</label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="min-h-12"
              onChange={(event) => onFile(event.target.files?.[0])}
            />
          </div>
          <TextArea id="csv-text" label="CSV-Text" value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => importCsv("append")}>Anfügen</Button>
            <Button type="button" variant="danger" onClick={() => importCsv("replace")}>Ersetzen</Button>
          </div>
        </div>
      </details>

      <div className="mt-4">
        <Button variant="secondary" onClick={reload}>Beispieldaten neu laden</Button>
      </div>
    </section>
  );
}
