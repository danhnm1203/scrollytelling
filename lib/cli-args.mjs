/**
 * Argument parsing for the `scrollytelling` CLI.
 *
 * Pure: no filesystem, no process exit, no console. `bin/cli.mjs` turns a
 * UsageError into an exit code; everything here just describes the command.
 */

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/** number = takes a value and must parse as a finite number; string = takes any value. */
const COMMANDS = {
  frames: {
    usage: "scrollytelling frames <video|image-dir> <project_dir> [options]",
    maxPositionals: 2,
    flags: {
      frames: { type: "number", default: 50 },
      "max-width": { type: "number", default: 1280 },
      quality: { type: "number", default: 82 },
      // Where the portrait crop sits horizontally, 0 (left edge) to 1 (right).
      focus: { type: "number", default: 0.5 },
      "skip-portrait": { type: "boolean", default: false },
      preview: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
    },
  },
  scaffold: {
    usage: "scrollytelling scaffold <project_dir> [--force] [--diff]",
    maxPositionals: 1,
    flags: {
      force: { type: "boolean", default: false },
      diff: { type: "boolean", default: false },
    },
  },
};

const ALIASES = {
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version",
};

export function commandNames() {
  return Object.keys(COMMANDS);
}

export function usageFor(command) {
  return COMMANDS[command]?.usage;
}

/**
 * @param {string[]} argv - arguments after the node binary and script path
 * @returns {{command: string, positionals: string[], flags: Record<string, unknown>}}
 */
export function parseArgs(argv) {
  const [head, ...rest] = argv;

  if (head === undefined) return { command: "help", positionals: [], flags: {} };
  if (ALIASES[head]) return { command: ALIASES[head], positionals: [], flags: {} };
  if (head === "help" || head === "version") {
    return { command: head, positionals: [], flags: {} };
  }

  const spec = COMMANDS[head];
  if (!spec) {
    throw new UsageError(
      `unknown command "${head}" — expected one of: ${commandNames().join(", ")}`,
    );
  }

  const flags = {};
  for (const [name, def] of Object.entries(spec.flags)) {
    if ("default" in def) flags[name] = def.default;
  }

  const positionals = [];
  let flagsEnded = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];

    if (flagsEnded || !token.startsWith("--") || token === "-") {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      flagsEnded = true;
      continue;
    }

    const eq = token.indexOf("=");
    const name = (eq === -1 ? token : token.slice(0, eq)).slice(2);
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);
    const def = spec.flags[name];

    if (!def) {
      throw new UsageError(
        `unknown flag "--${name}" for "${head}" — see: ${spec.usage}`,
      );
    }

    if (def.type === "boolean") {
      if (inlineValue !== undefined) {
        throw new UsageError(`flag "--${name}" takes no value`);
      }
      flags[name] = true;
      continue;
    }

    // A value flag must not swallow the next flag: `--frames --quality 70`
    // would otherwise set frames to NaN and silently drop --quality.
    const value = inlineValue !== undefined ? inlineValue : rest[++i];
    if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) {
      throw new UsageError(`flag "--${name}" needs a value`);
    }

    if (def.type === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new UsageError(`flag "--${name}" needs a number, got "${value}"`);
      }
      flags[name] = parsed;
      continue;
    }

    flags[name] = value;
  }

  if (positionals.length > spec.maxPositionals) {
    throw new UsageError(
      `too many arguments for "${head}" (got ${positionals.length}, expected at most ` +
        `${spec.maxPositionals}) — see: ${spec.usage}`,
    );
  }

  return { command: head, positionals, flags };
}
