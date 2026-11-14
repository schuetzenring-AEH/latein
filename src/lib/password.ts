export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase("de");
}

export async function hashPassword(password: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("sha256");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
