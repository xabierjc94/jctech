import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

beforeAll(() => {
  process.env.CREDENTIALS_SECRET = "secreto-de-pruebas";
});

describe("cifrado de credenciales", () => {
  it("descifra lo que cifró", () => {
    const original = "EAAG...token-de-meta";
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });

  it("produce un texto distinto cada vez (IV aleatorio)", () => {
    expect(encryptSecret("mismo")).not.toBe(encryptSecret("mismo"));
  });

  it("no deja el texto original a la vista", () => {
    expect(encryptSecret("token-secreto")).not.toContain("token-secreto");
  });

  it("rechaza un texto manipulado", () => {
    const payload = encryptSecret("token");
    const [iv, tag, data] = payload.split(".");
    const tampered = [iv, tag, data.slice(0, -2) + "AA"].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rechaza un formato inválido", () => {
    expect(() => decryptSecret("basura")).toThrow("formato inválido");
  });
});
