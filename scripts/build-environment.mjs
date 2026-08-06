import { access, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function exists(file) {
  try { await access(file, constants.F_OK); return true; } catch { return false; }
}

async function requireFile(file, purpose) {
  if (!await exists(file)) throw new Error(`${purpose} is missing: ${path.relative(root, file)}`);
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
  await cp(source, path.join(target.directory, "public"), { recursive: true });
  const readme = `# Vidhai ERP frontend\n\nEnvironment: ${label}\nBuild: ${target.number}\nGenerated: ${new Date().toISOString()}\n\nDeploy the contents of \`public/\` to the web-server document root and configure SPA fallback to \`index.html\`.\n`;
  await writeFile(path.join(target.directory, "README.md"), readme);
  await zipDirectory(target.directory, target.zip);
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
  for (const candidate of environment === "staging" ? ["ecosystem.staging.config.cjs", "ecosystem.config.cjs", "ecosystem.config.js"] : ["ecosystem.config.cjs", "ecosystem.config.js"]) {
    const sourceFile = path.join(backendDir, candidate);
    if (await exists(sourceFile)) { await copyFile(sourceFile, path.join(target.directory, "ecosystem.config.cjs")); break; }
  }
  const sourcePackage = JSON.parse(await readFile(path.join(backendDir, "package.json"), "utf8"));
  const runtimePackage = { name: "vidhai-api-server", version: sourcePackage.version, private: true, type: "module", main: "./dist/index.mjs", scripts: { start: `node --env-file=${envFileName} --enable-source-maps ./dist/index.mjs` }, engines: { node: ">=20.19.0" } };
  await writeFile(path.join(target.directory, "package.json"), `${JSON.stringify(runtimePackage, null, 2)}\n`);
  const readme = `# Vidhai ERP API\n\nEnvironment: ${label}\nBuild: ${target.number}\nGenerated: ${new Date().toISOString()}\n\nStart with \`npm start\` or \`pm2 start ecosystem.config.cjs\`. The runtime configuration is loaded from \`${envFileName}\`. Protect that file because it may contain secrets. Keep the \`uploads/\` directory persistent between deployments.\n`;
  await writeFile(path.join(target.directory, "README.md"), readme);
  await zipDirectory(target.directory, target.zip);
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
