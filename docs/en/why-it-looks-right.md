# Why it looks right

Two measurements are taken while each frame is encoded, and the page uses both.

## The background matches the frame

**The page background matches each frame's own border color**, interpolated as
you scroll, so the canvas has no visible edge against the page. Pin the page to a
single hex instead and that edge shows on every frame whose border does not
happen to match — which is every frame, on any footage with a gradient or
changing exposure.

## The copy backdrop is sized to what is behind it

**Each block of copy gets a backdrop sized to the luminance behind it.** White
text at a fixed opacity stops being readable the moment a frame brightens under
it. Over dark footage the backdrop is nearly invisible and the image stays clean.

This is what `frames --check` reads. It compares each beat you wrote against the
frames that will actually be behind it, and names the ones that will be hard to
read and where to move them.

## Two sequences, not one

It also builds **two sequences**, landscape and a portrait crop, and the page
picks whichever suits the screen. A 16:9 frame cannot fill a 9:19.5 phone without
cropping most of its width, so without this a phone shows a strip surrounded by
background.

The portrait crop's horizontal position is `--focus`, in case the subject does
not sit in the middle of the frame.

## The sequence eases rather than snapping

**The sequence eases toward the scroll position rather than snapping to it.**
Locking the drawn frame 1:1 to scroll is the obvious design and it is what makes
a sequence look mechanical: at 50 frames over 500vh a single frame covers about
10vh, so one trackpad flick crosses several frames between two paints and the
jump is visible. The page spends about a third of a second catching up instead,
which spreads that jump over enough frames to read as motion.

This is not smooth scrolling. The scroll position stays exactly the browser's —
no wheel events are intercepted, no scrolling is virtualised, and anchor links,
scrollbars and Find-in-page all behave normally. Only what is drawn is eased.
The knob is `SCRUB_SECONDS` in the adapter your template generated —
`components/ScrollSequence.tsx` in the Next project, its equivalent elsewhere.
Set it to `0` for a hard 1:1 lock.
