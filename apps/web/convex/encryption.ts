const algorithm = { name: "AES-GCM", length: 256 } as const;
const VERSION = "v1";

function configuredSecret() {
  const secret = process.env.AI_KEYS_ENCRYPTION_SECRET;
  if (!secret) throw new Error("AI_KEYS_ENCRYPTION_SECRET doit être configurée dans Convex.");
  return secret;
}

async function deriveKey(secret: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode("sutura-ai-api-keys-v1"), iterations: 100_000, hash: "SHA-256" }, material, algorithm, false, ["encrypt", "decrypt"]);
}

export async function encryptValue(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(configuredSecret()), new TextEncoder().encode(value));
  return `${VERSION}.${Buffer.from(iv).toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

export async function decryptValue(value: string): Promise<string> {
  const parts = value.split(".");
  let ivPart: string | undefined;
  let encryptedPart: string | undefined;
  if (parts.length === 3 && parts[0] === VERSION) {
    ivPart = parts[1];
    encryptedPart = parts[2];
  } else if (parts.length === 2) {
    // legacy format iv.ciphertext
    ivPart = parts[0];
    encryptedPart = parts[1];
  } else {
    throw new Error("Clé IA chiffrée invalide.");
  }
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(ivPart!, "base64url") }, await deriveKey(configuredSecret()), Buffer.from(encryptedPart!, "base64url"));
  return new TextDecoder().decode(decrypted);
}
