import { createHash, randomBytes } from "node:crypto";

const VERIFIER_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export function createCodeVerifier() {
  const bytes = randomBytes(32);
  let verifier = "";
  for (let i = 0; i < 43; i++) {
    verifier += VERIFIER_CHARS[bytes[i % bytes.length] % VERIFIER_CHARS.length];
  }
  return verifier;
}

export function codeChallengeFromVerifier(verifier) {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
