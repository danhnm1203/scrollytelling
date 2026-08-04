/**
 * Working out what changed in the template since a project was generated.
 *
 * There is no template history to consult — the package ships one version of
 * the files. What makes this answerable is that scaffold records the hash of
 * every file it wrote, so the project carries its own baseline:
 *
 *   recorded  what the template looked like when this project was generated
 *   current   what the template looks like now
 *   project   what the project's files look like today
 *
 * The third set is what separates a fix you can take from a fix that would
 * overwrite your own work. Without it the tool would confidently recommend
 * adopting changes to files people had customised.
 *
 * Pure: hashes in, categories out. Nothing here reads a disk.
 */

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {{recorded: Record<string,string>, current: Record<string,string>, project: Record<string,string>}} sets
 */
export function planUpgrade({ recorded, current, project }) {
  const adoptable = [];
  const conflicted = [];
  const missing = [];
  const added = [];
  const removed = [];

  // A project generated before versions were recorded has no baseline. Saying
  // "the baseline is unknown" is more useful than declaring every file new.
  const knowsBaseline = Object.keys(recorded).length > 0;

  if (knowsBaseline) {
    for (const path of Object.keys(current)) {
      if (!(path in recorded)) {
        added.push(path);
        continue;
      }
      if (current[path] === recorded[path]) continue; // template has not moved

      if (!(path in project)) missing.push(path);
      else if (project[path] === recorded[path]) adoptable.push(path);
      else conflicted.push(path);
    }

    for (const path of Object.keys(recorded)) {
      if (!(path in current)) removed.push(path);
    }
  }

  for (const list of [adoptable, conflicted, missing, added, removed]) list.sort(byName);

  return {
    knowsBaseline,
    adoptable,
    conflicted,
    missing,
    added,
    removed,
    hasChanges:
      adoptable.length + conflicted.length + missing.length + added.length + removed.length > 0,
  };
}
