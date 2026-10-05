import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts the member's Google credential before it is stored (AES-256-GCM). The key
 * lives in the environment, never in the database, so a copy of the database alone
 * opens nothing. GCM also detects tampering: a changed or truncated value fails to
 * decrypt rather than yielding something wrong.
 *
 * Stored form: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */

const VERSION = "v1";

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes, base64 encoded");
  return key;
}

export function encryptToken(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(stored: string, base64Key: string): string {
  const [version, iv, tag, ciphertext] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unrecognised stored credential");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
