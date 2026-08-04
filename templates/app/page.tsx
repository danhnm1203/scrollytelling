import { ScrollSequence } from "@/components/ScrollSequence";
import { story } from "@/components/story";

/**
 * The story, once, as ordinary prose.
 *
 * Visually hidden but present in the document, so a screen reader gets one
 * coherent description and a crawler sees the whole page's copy. The scrolling
 * canvas is decoration over footage and is marked aria-hidden; read linearly,
 * its four beats fading in and out are disconnected fragments.
 */
function StoryOutline() {
  return (
    <main className="sr-only">
      <h1>{story.brand}</h1>
      <p>{story.description}</p>
      {story.sections.map((beat) => (
        <section key={beat.at}>
          <h2>{beat.heading}</h2>
          <p>{beat.body}</p>
        </section>
      ))}
    </main>
  );
}

export default function Page() {
  return (
    <>
      <StoryOutline />
      <ScrollSequence />
    </>
  );
}
