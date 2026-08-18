function pemToBytes(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const decoded = atob(base64);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return buffer;
}

export async function encryptLoginPassword(password: string): Promise<string> {
  const response = await fetch("/api/auth/login-key", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Unable to secure login credentials");
  const { publicKey } = (await response.json()) as { publicKey: string };
  const key = await crypto.subtle.importKey(
    "spki",
    pemToBytes(publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    new TextEncoder().encode(password),
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}
