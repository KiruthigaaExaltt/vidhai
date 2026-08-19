import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

function fail(message) {
  throw new Error(`Package verification failed: ${message}`);
}

export function zipEntries(buffer) {
  const min = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= min; i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0)
    fail(
      "ZIP end-of-central-directory record is missing or the archive is corrupt",
    );
  const count = buffer.readUInt16LE(eocd + 10),
    offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50)
      fail(`invalid ZIP central-directory entry ${i + 1}`);
    const nameLength = buffer.readUInt16LE(cursor + 28),
      extraLength = buffer.readUInt16LE(cursor + 30),
      commentLength = buffer.readUInt16LE(cursor + 32);
    entries.push(
      buffer
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString("utf8")
        .replaceAll("\\", "/"),
    );
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function verifyEntries(entries, kind, environment) {
  if (!entries.length) fail("archive is empty");
  const files = entries.filter((name) => !name.endsWith("/"));
  const lower = new Set();
  for (const name of files) {
    if (
      !name ||
      name.startsWith("/") ||
      /^[A-Za-z]:/.test(name) ||
      name.split("/").includes("..")
    )
      fail(`unsafe archive path: ${name}`);
    if (
      /(^|[_ .-])copy([_ .-]|$)/i.test(path.basename(name)) ||
      /_copy/i.test(name)
    )
      fail(
        `copy-suffixed file detected: ${name}; deploy into an empty target directory instead of renaming collisions`,
      );
    const key = name.toLowerCase();
    if (lower.has(key))
      fail(`duplicate archive path (case-insensitive): ${name}`);
    lower.add(key);
  }
  const has = (name) => lower.has(name.toLowerCase());
  if (kind === "frontend") {
    for (const required of [
      "index.html",
      "manifest.webmanifest",
      "sw.js",
      ".htaccess",
      "web.config",
      "README.md",
    ])
      if (!has(required)) fail(`frontend is missing ${required}`);
    if (!files.some((name) => /^assets\/.*\.js$/i.test(name)))
      fail("frontend has no compiled JavaScript asset");
    if (!files.some((name) => /^assets\/.*\.css$/i.test(name)))
      fail("frontend has no compiled CSS asset");
    if (files.some((name) => name.startsWith("public/")))
      fail(
        "frontend contains an unnecessary public/ wrapper; files must extract directly into the document root",
      );
  } else if (kind === "backend") {
    for (const required of [
      "dist/index.mjs",
      "dist/seed-data.mjs",
      `.env.${environment}`,
      "ecosystem.config.cjs",
      "package.json",
      "README.md",
    ])
      if (!has(required)) fail(`backend is missing ${required}`);
    if (
      !files.some(
        (name) => name === "uploads/.gitkeep" || name.startsWith("uploads/"),
      )
    )
      fail("backend is missing the persistent uploads directory marker");
  } else fail(`unknown package kind: ${kind}`);
  return { files: files.length };
}

export async function verifyZip(zipFile, kind, environment) {
  const info = await stat(zipFile).catch(() => null);
  if (!info?.isFile() || info.size < 22)
    fail(`ZIP does not exist or is empty: ${zipFile}`);
  const entries = zipEntries(await readFile(zipFile));
  const result = verifyEntries(entries, kind, environment);
  return { ...result, bytes: info.size, entries };
}

export async function verifyFrontendApi(frontendDirectory, expectedOrigin) {
  const assets = path.join(frontendDirectory, "assets");
  const scripts = (await readdir(assets)).filter((name) =>
    name.endsWith(".js"),
  );
  if (!scripts.length) fail("compiled frontend JavaScript is missing");
  const found = (
    await Promise.all(
      scripts.map((name) => readFile(path.join(assets, name), "utf8")),
    )
  ).some((code) => code.includes(expectedOrigin));
  if (!found)
    fail(
      `compiled frontend does not contain configured API origin ${expectedOrigin}; API calls may return SPA HTML`,
    );
}

export function verifyEcosystemText(text, environment) {
  const expected = `.env.${environment}`;
  if (!text.includes(`--env-file=${expected}`))
    fail(`PM2 config does not explicitly load ${expected}`);
  for (const other of ["demo", "staging", "production"].filter(
    (value) => value !== environment,
  )) {
    if (text.includes(`--env-file=.env.${other}`))
      fail(
        `PM2 config for ${environment} incorrectly references .env.${other}`,
      );
  }
}
