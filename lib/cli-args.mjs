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

/**
 * number = takes a value and must parse as a finite number; string = takes any
 * value; url = takes a value and must be an absolute http(s) base url.
 */
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
      // Where the finished page will be served from. No default: a page that
      // has not been told cannot guess, and guessing wrong is worse than
      // leaving the absolute urls unbuilt.
      "site-url": { type: "url" },
      // Overrides what .scrollytelling-version recorded. Rarely needed, but
      // never being able to say it is worse than repeating it.
      template: { type: "string" },
      "skip-portrait": { type: "boolean", default: false },
      preview: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
    },
  },
  scaffold: {
    usage: "scrollytelling scaffold <project_dir> [--template <name>] [--force] [--diff]",
    maxPositionals: 1,
    flags: {
      // No default: absent means "the default template", while an explicit
      // --template with no value means "list them". scripts/scaffold.mjs does
      // the printing, because this module stays free of console.
      template: { type: "string", valueOptional: true },
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

/**
 * The base url a finished page will be served from.
 *
 * Normalised to always end in a slash, which is what makes it safe to resolve
 * against. Url resolution is not string concatenation: with a trailing slash
 * `new URL("og.png", ".../scrollytelling/")` is `.../scrollytelling/og.png`,
 * and without one it is `.../og.png` — the last segment is dropped, not
 * doubled. A wrong path is harder to notice than a doubled slash, so the
 * normalisation happens once, here, rather than at each call site.
 *
 * The path is kept on purpose. A GitHub Pages project site is served from
 * `/<repo>/`, so reducing this to an origin would break the deploy target this
 * flag exists for.
 */
function baseUrl(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(
      `flag "--${name}" needs an absolute url, got "${value}" — ` +
        "for example https://you.github.io/your-repo/",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError(
      `flag "--${name}" needs an http or https url, got "${value}" — ` +
        "a crawler cannot fetch a card from any other scheme",
    );
  }

  // A query or fragment on a base url is dropped the moment anything resolves
  // against it, so keeping it would put a value in the page that no request
  // ever carries. Refuse instead of quietly disagreeing with itself.
  if (url.search || url.hash) {
    throw new UsageError(
      `flag "--${name}" needs a plain base url, got "${value}" — ` +
        "drop the query and fragment",
    );
  }

  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

/** The one place a flag's raw string becomes its typed value. */
function coerceValue(name, type, value) {
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new UsageError(`flag "--${name}" needs a number, got "${value}"`);
    }
    return parsed;
  }
  if (type === "url") return baseUrl(name, value);
  return value;
}

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
      // Some flags are legitimately bare: `--template` alone asks what the
      // options are. Null rather than true, so a caller can tell "asked with no
      // value" from "not asked".
      if (def.valueOptional) {
        if (inlineValue === undefined && value !== undefined) i--;
        flags[name] = null;
        continue;
      }
      throw new UsageError(`flag "--${name}" needs a value`);
    }

    flags[name] = coerceValue(name, def.type, value);
  }

  if (positionals.length > spec.maxPositionals) {
    throw new UsageError(
      `too many arguments for "${head}" (got ${positionals.length}, expected at most ` +
        `${spec.maxPositionals}) — see: ${spec.usage}`,
    );
  }

  return { command: head, positionals, flags };
}
