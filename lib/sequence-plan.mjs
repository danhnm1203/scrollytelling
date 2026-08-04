/**
 * Deciding which frames make up a sequence, and where to seek for them.
 *
 * Pure arithmetic over names and numbers — no filesystem, no ffmpeg. The
 * pipeline asks these questions before it touches anything.
 */

/** Seeking to exactly the duration usually yields no output, so stop short. */
const END_EPSILON = 0.04;

/**
 * Orders names the way a human reads them: frame_2 before frame_10.
 *
 * A plain string sort puts frame_10 between frame_1 and frame_2, and the
 * animation plays out of order — a defect that looks like a broken clip rather
 * than a sorting bug, which is why it costs so much to track down.
 *
 * Deliberately does not use localeCompare: ordering must not depend on the
 * machine's locale.
 */
export function naturalCompare(a, b) {
  const chunks = /(\d+)|(\D+)/g;
  const left = String(a).match(chunks) ?? [];
  const right = String(b).match(chunks) ?? [];

  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    const bothNumeric = /^\d/.test(l) && /^\d/.test(r);

    if (bothNumeric) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff;
      // Equal value, different padding (009 vs 9): shorter first, so the order
      // is at least stable rather than arbitrary.
      if (l.length !== r.length) return l.length - r.length;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }

  return left.length - right.length;
}

/**
 * Picks `count` items spread evenly across `items`, always keeping the first
 * and last — those are the moments a visitor lands on and finishes on.
 *
 * Asking for more than exists returns everything rather than failing; a short
 * directory is a reason to warn, not to stop.
 */
export function decimate(items, count) {
  if (items.length === 0) return [];
  if (count >= items.length) return [...items];
  if (count <= 1) return [items[0]];

  const out = [];
  const step = (items.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    out.push(items[Math.round(i * step)]);
  }
  return out;
}

/**
 * Evenly spaced seek points across a clip, in seconds.
 *
 * Cost scales with the number of frames wanted, not the length of the source,
 * because each of these becomes one seek rather than a full decode pass.
 */
export function timestampsFor(durationSeconds, count) {
  if (count <= 1) return [0];

  // Stay inside the clip, but never past its midpoint on a very short one.
  const end = Math.max(0, durationSeconds - Math.min(END_EPSILON, durationSeconds / 2));
  const step = end / (count - 1);
  return Array.from({ length: count }, (_, i) => i * step);
}
