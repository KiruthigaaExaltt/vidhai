import { access, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEcosystemText, verifyFrontendApi, verifyZip } from "./verify-build-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(root, "artifacts", "vidhai-erp");
const backendDir = path.join(root, "artifacts", "api-server");
const outputRoot = path.join(root, "build files");
const environment = process.argv[2];
const clientOnly = process.argv.includes("--client-only");
const serverOnly = process.argv.includes("--server-only");
const checkOnly = process.argv.includes("--check");

if (!["demo", "staging", "prod"].includes(environment)) {
  throw new Error("Usage: node scripts/build-environment.mjs <demo|staging|prod> [--client-only|--server-only|--check]");
}
if (clientOnly && serverOnly) throw new Error("Choose either --client-only or --server-only, not both.");

const envFileName = `.env.${environment}`;
const frontendEnv = path.join(frontendDir, envFileName);
const backendEnv = path.join(backendDir, envFileName);
const label = environment === "prod" ? "production" : environment;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const { apiOrigin: frontendApiOrigin } = await frontendBuildConfig();

async function exists(file) {
  try { await access(file, constants.F_OK); return true; } catch { return false; }
}

async function requireFile(file, purpose) {
  if (!await exists(file)) throw new Error(`${purpose} is missing: ${path.relative(root, file)}`);
}

async function frontendBuildConfig() {
  const values = Object.fromEntries((await readFile(frontendEnv, "utf8")).split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith("#") && line.includes("=")).map(line => { const i=line.indexOf("="); return [line.slice(0,i).trim(),line.slice(i+1).trim()]; }));
  if (!values.BASE_PATH?.startsWith("/") || !values.BASE_PATH.endsWith("/")) throw new Error(`${envFileName}: BASE_PATH must start and end with /`);
  const raw = values.VITE_API_BASE;
  if (environment === "staging" && !raw) throw new Error(`${envFileName}: VITE_API_BASE is required so deployed API calls do not fall through to SPA index.html`);
  const backendValues = Object.fromEntries((await readFile(backendEnv, "utf8")).split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith("#") && line.includes("=")).map(line => { const i=line.indexOf("="); return [line.slice(0,i).trim(),line.slice(i+1).trim()]; }));
  const corsRaw = backendValues.CORS_ALLOWED_ORIGINS || backendValues.CORS_ORIGIN;
  if (["staging", "prod"].includes(environment) && !corsRaw) throw new Error(`${envFileName}: backend CORS_ALLOWED_ORIGINS is required`);
  for (const origin of String(corsRaw || "").split(",").map(value => value.trim()).filter(Boolean)) {
    let corsUrl; try { corsUrl = new URL(origin); } catch { throw new Error(`${envFileName}: invalid CORS origin ${origin}`); }
    if (!["http:", "https:"].includes(corsUrl.protocol) || corsUrl.origin !== origin.replace(/\/$/, "")) throw new Error(`${envFileName}: CORS origins must not contain paths`);
  }
  if (!raw) return { apiOrigin: null };
  let url; try { url = new URL(raw); } catch { throw new Error(`${envFileName}: VITE_API_BASE must be an absolute HTTP(S) URL`); }
  if (!["http:","https:"].includes(url.protocol) || (url.pathname !== "/" && url.pathname !== "")) throw new Error(`${envFileName}: VITE_API_BASE must contain only the API origin, without /api or another path`);
  return { apiOrigin: url.origin };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd ?? root, stdio: "inherit", env: { ...process.env, ...options.env }, shell: options.shell ?? (process.platform === "win32" && command.endsWith(".cmd")) });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function nextPackage(prefix) {
  await mkdir(outputRoot, { recursive: true });
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  const entries = await readdir(outputRoot, { withFileTypes: true });
  const highest = entries.filter(entry => entry.isDirectory()).map(entry => entry.name.match(pattern)).filter(Boolean).reduce((max, match) => Math.max(max, Number(match[1])), 0);
  const name = `${prefix}-${highest + 1}`;
  return { name, directory: path.join(outputRoot, name), zip: path.join(outputRoot, `${name}.zip`), number: highest + 1 };
}

async function zipDirectory(directory, destination) {
  await rm(destination, { force: true });
  if (process.platform === "win32") {
    const quote = value => value.replaceAll("'", "''");
    const command = `$items=Get-ChildItem -LiteralPath '${quote(directory)}' -Force; Compress-Archive -Path $items.FullName -DestinationPath '${quote(destination)}' -Force`;
    await run("powershell.exe", ["-NoProfile", "-Command", command], { shell: false });
  } else {
    await run("zip", ["-rq", destination, "."], { cwd: directory });
  }
}

async function packageFrontend() {
  const source = path.join(frontendDir, "dist", "public");
  await requireFile(path.join(source, "index.html"), "Compiled frontend");
  const target = await nextPackage(`vidhai-frontend-${environment}-build`);
  await mkdir(target.directory, { recursive: false });
  await cp(source, target.directory, { recursive: true });
  const readme = `# Vidhai ERP frontend\n\nEnvironment: ${label}\nBuild: ${target.number}\nGenerated: ${new Date().toISOString()}\nAPI origin: ${frontendApiOrigin ?? "same-origin /api proxy"}\n\nExtract this archive directly into an empty web-server document root. The archive root contains \`index.html\`, \`assets/\`, and \`sw.js\`; do not place them inside another \`public/\` folder. Remove the previous release first because extracting over existing files can cause hosting panels to create \`_copy\` filenames.\n`;
  await writeFile(path.join(target.directory, "README.md"), readme);
  await zipDirectory(target.directory, target.zip);
  if (frontendApiOrigin) await verifyFrontendApi(target.directory, frontendApiOrigin);
  await verifyZip(target.zip, "frontend", environment);
  console.log(`Created ${path.relative(root, target.directory)} and ${path.relative(root, target.zip)}`);
}

async function packageBackend() {
  const source = path.join(backendDir, "dist");
  await requireFile(path.join(source, "index.mjs"), "Compiled backend");
  const target = await nextPackage(`vidhai-backend-${environment}-build`);
  await mkdir(target.directory, { recursive: false });
  await cp(source, path.join(target.directory, "dist"), { recursive: true });
  await copyFile(backendEnv, path.join(target.directory, envFileName));
  const packagedUploads = path.join(target.directory, "uploads");
  const sourceUploads = path.join(backendDir, "uploads");
  if (await exists(sourceUploads)) await cp(sourceUploads, packagedUploads, { recursive: true });
  else await mkdir(packagedUploads, { recursive: true });
  const ecosystem = `module.exports = {
  apps: [{
    name: "vidhai-api-server",
    cwd: __dirname,
    script: "./dist/index.mjs",
    interpreter: "node",
    node_args: "--env-file=${envFileName} --enable-source-maps",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    time: true,
    env: { NODE_ENV: "${label}" }
  }]
};
`;
  await writeFile(path.join(target.directory, "ecosystem.config.cjs"), ecosystem);
  verifyEcosystemText(ecosystem, environment);
  const sourcePackage = JSON.parse(await readFile(path.join(backendDir, "package.json"), "utf8"));
  const runtimePackage = { name: "vidhai-api-server", version: sourcePackage.version, private: true, type: "module", main: "./dist/index.mjs", scripts: { start: `node --env-file=${envFileName} --enable-source-maps ./dist/index.mjs` }, engines: { node: ">=20.19.0" } };
  await writeFile(path.join(target.directory, "package.json"), `${JSON.stringify(runtimePackage, null, 2)}\n`);
  const readme = `# Vidhai ERP API\n\nEnvironment: ${label}\nBuild: ${target.number}\nGenerated: ${new Date().toISOString()}\n\nStart with \`npm start\` or \`pm2 start ecosystem.config.cjs\`. The runtime configuration is loaded from \`${envFileName}\`. Protect that file because it may contain secrets. Keep the \`uploads/\` directory persistent between deployments.\n`;
  await writeFile(path.join(target.directory, "README.md"), readme);
  await zipDirectory(target.directory, target.zip);
  await verifyZip(target.zip, "backend", environment);
  console.log(`Created ${path.relative(root, target.directory)} and ${path.relative(root, target.zip)}`);
}

await requireFile(frontendEnv, `${label} frontend environment file`);
await requireFile(backendEnv, `${label} backend environment file`);
if (checkOnly) {
  console.log(`Build configuration OK: ${envFileName}`);
  process.exit(0);
}

if (!serverOnly) {
  await run(pnpm, ["--dir", "artifacts/vidhai-erp", "exec", "vite", "build", "--config", "vite.config.ts", "--mode", environment]);
  for (const name of [".htaccess", "web.config"]) {
    const source = path.join(frontendDir, name);
    if (await exists(source)) await copyFile(source, path.join(frontendDir, "dist", "public", name));
  }
  await packageFrontend();
}
if (!clientOnly) {
  await run(pnpm, ["--dir", "artifacts/api-server", "run", "build"], { env: { NODE_ENV: label } });
  await packageBackend();
}
