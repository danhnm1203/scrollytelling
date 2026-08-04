/**
 * Fetches and decodes frames off the main thread.
 *
 * Decode is the most expensive operation in a scroll-driven animation, and
 * doing it on the scroll path is what makes these pages stutter. The worker
 * hands back an ImageBitmap, transferred rather than copied, so the main thread
 * only ever draws.
 *
 *   main ──{ decode, index, url }──▶ worker ──▶ fetch ──▶ createImageBitmap
 *        ◀─{ index, bitmap }────────                        (transferred)
 *
 * The caller is responsible for calling .close() on every bitmap it stops
 * using. Nothing here can know when that is, and a bitmap nobody closes is
 * pinned for the life of the page.
 */

self.onmessage = async (event) => {
  const { index, url, token } = event.data ?? {};
  if (typeof index !== "number" || typeof url !== "string") return;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bitmap = await createImageBitmap(await response.blob());
    self.postMessage({ index, token, bitmap }, [bitmap]);
  } catch (error) {
    // The main thread counts and names failures; it owns the user-facing
    // message because it knows which sequence and which command would fix it.
    self.postMessage({ index, token, error: String(error?.message ?? error) });
  }
};
