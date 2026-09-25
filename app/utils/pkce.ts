/** PKCE helpers for the native sign-in hand-off (WebCrypto only). */

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** 32 random bytes, base64url (43 chars). */
export function createVerifier(): string {
  return randomString(32);
}

/** base64url(sha256(verifier)) — the S256 challenge. */
export async function createChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** 16 random bytes, base64url (22 chars): ties the deep link back to this attempt. */
export function createState(): string {
  return randomString(16);
}

/** A base64url string of the given length range — sanity check for query params. */
export function looksLikeBase64url(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}
