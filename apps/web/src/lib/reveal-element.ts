const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Scrolls an element to the middle of the screen. Listing cards off screen only
 * have an estimated height until they're drawn (`content-visibility`), so the
 * cards drawn on the way shift the layout and a single jump can land short.
 * Jump again until the element stays put.
 */
export async function revealElement(id: string, maxJumps = 6): Promise<void> {
  let previousTop: number | null = null;
  for (let jump = 0; jump < maxJumps; jump++) {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    await nextFrame();
    await nextFrame();
    const top = element.getBoundingClientRect().top;
    if (previousTop !== null && Math.abs(top - previousTop) < 1) return;
    previousTop = top;
  }
}
