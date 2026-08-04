import { ScrollSequence } from "@/components/ScrollSequence";
import { story } from "@/components/story";

/**
 * The story, once, as ordinary prose.
 *
 * Visually hidden but present in the document, so a screen reader gets one
 * coherent description and a crawler sees the whole page's copy. The scrolling
 * canvas is decoration over footage and is marked aria-hidden; read linearly,
 * its four beats fading in and out are disconnected fragments.
 *
 * It is also the page a visitor gets when they have asked for reduced motion:
 * the scrub does not run then, and globals.css makes this visible rather than
 * inventing a second, lesser version of the same copy. The `story-outline`
 * class is what that media query hangs off, so keep it if you restyle this.
 */
function StoryOutline() {
  return (
    <main className="story-outline sr-only">
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
