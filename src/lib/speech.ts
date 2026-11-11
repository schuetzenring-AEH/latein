export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function speakableLatin(form: string): string {
  const stripped = form.replace(/^\*\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return stripped || form;
}

export function speakText(text: string, lang: "la" | "de"): void {
  if (!canSpeak()) return;
  try {
    const spoken = lang === "la" ? speakableLatin(text) : text.trim();
    if (!spoken) return;
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = lang === "la" ? "la" : "de-DE";
    utterance.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech can fail without a voice. The quiz and the game still run.
  }
}

export function speakLatin(form: string): void {
  speakText(form, "la");
}
