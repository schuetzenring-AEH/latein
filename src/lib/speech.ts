export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function speakableLatin(form: string): string {
  const stripped = form.replace(/^\*\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return stripped || form;
}

export function speakLatin(form: string): void {
  if (!canSpeak()) return;
  try {
    const utterance = new SpeechSynthesisUtterance(speakableLatin(form));
    utterance.lang = "la";
    utterance.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech can fail without a voice. The quiz still works.
  }
}
