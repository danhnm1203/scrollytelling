/**
 * Copies `templates/` into a new project directory.
 *
 * NOT IMPLEMENTED YET — tasks T5, T15, E11. Depends only on `node:fs`; no
 * sharp, no ffmpeg. The skeleton exists so `bin/cli.mjs` fails with a sentence
 * instead of a module-resolution stack trace.
 */

export async function run(_positionals, _flags) {
  process.stderr.write(
    "open-scrolltelling: `scaffold` is not implemented yet (tasks T5/T15/E11).\n",
  );
  return 3;
}
