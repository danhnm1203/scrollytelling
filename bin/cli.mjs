#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseArgs, UsageError } from "../lib/cli-args.mjs";

const HELP = `scrollytelling — turn a video into a scroll-scrubbed hero page
                 (Next, Nuxt, Astro or plain HTML)

Usage
  scrollytelling scaffold <project_dir> [--template <name>] [--force] [--diff]
  scrollytelling frames <video|image-dir> <project_dir> [options]
  scrollytelling frames --preview <video>
  scrollytelling frames --check <project_dir>

frames options
  --frames <n>      number of frames in the sequence      (default 50)
  --max-width <px>  longest edge of the encoded webp      (default 1280)
  --quality <n>     webp quality, 1-100                   (default 82)
  --focus <0-1>     where the portrait crop sits horizontally  (default 0.5)
  --skip-portrait   build only the landscape sequence
  --template <name> override the template recorded by scaffold (rarely needed)

scaffold options
  --template <name> which template to generate; omit the name to list them
  --force           overwrite existing template files
  --diff            report template changes since this project was generated

Other
  -h, --help        show this help
  -v, --version     print the version

Docs: https://github.com/danhnm1203/scrollytelling
`;

function version() {
  const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
  return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

async function main(argv) {
  const { command, positionals, flags } = parseArgs(argv);

  switch (command) {
    case "help":
      process.stdout.write(HELP);
      return 0;
    case "version":
      process.stdout.write(`${version()}\n`);
      return 0;
    case "frames": {
      const { run } = await import("../scripts/frames.mjs");
      return await run(positionals, flags);
    }
    case "scaffold": {
      const { run } = await import("../scripts/scaffold.mjs");
      return await run(positionals, flags);
    }
    default:
      // parseArgs already rejects anything else; this is a guard, not a path.
      throw new UsageError(`unhandled command "${command}"`);
  }
}

try {
  process.exitCode = (await main(process.argv.slice(2))) ?? 0;
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write(`scrollytelling: ${err.message}\n\nRun with --help for usage.\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`scrollytelling: ${err?.stack ?? err}\n`);
    process.exitCode = 1;
  }
}
