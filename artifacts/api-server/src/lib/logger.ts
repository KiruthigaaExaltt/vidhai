import pino from "pino";

// Pretty logging uses a worker-thread transport. Keep that development-only:
// deployment packages (including staging) should log directly to stdout so a
// missing/broken transport worker cannot take down the API process.
const usePrettyTransport = process.env.LOG_PRETTY === "true";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(usePrettyTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
