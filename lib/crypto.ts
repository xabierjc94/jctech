import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function key(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET;

  if (!secret) {
    throw new Error("Falta CREDENTIALS_SECRET");
  }

  // Se deriva una clave de 32 bytes, así el secreto puede tener cualquier largo.
  return crypto.createHash("sha256").update(secret).digest();
}

/** Cifra un texto. Devuelve "iv.tag.ciphertext" en base64url. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/** Descifra lo producido por `encryptSecret`. Lanza si el texto fue manipulado. */
export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");

  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Credencial con formato inválido");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
