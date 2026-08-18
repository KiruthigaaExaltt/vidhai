import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";

export function createLoginKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function decryptLoginPassword(ciphertext: string, privateKey: string): string {
  const encrypted = Buffer.from(ciphertext, "base64");
  if (encrypted.length !== 256) throw new Error("Invalid encrypted credential");
  return privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    encrypted,
  ).toString("utf8");
}
