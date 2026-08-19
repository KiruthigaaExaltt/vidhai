const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const envFile = [".env.production", ".env.staging", ".env.demo", ".env"].find(
  (name) => fs.existsSync(path.join(root, name)),
);

if (!envFile) {
  throw new Error(
    "No runtime environment file was found beside ecosystem.config.cjs",
  );
}

module.exports = {
  apps: [
    {
      name: "vidhai-api-server",
      cwd: root,
      script: "./dist/index.mjs",
      interpreter: "node",
      node_args: `--env-file=${envFile} --enable-source-maps`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      time: true,
      env: {
        NODE_ENV:
          envFile === ".env.production" ? "production" : envFile.slice(5),
      },
    },
  ],
};
