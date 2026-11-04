// Drag-to-swipe for a card (mouse, touch or pen). Vertical scrolling still
// works because the card uses `touch-action: pan-y`.
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function attachSwipe(card, { onSwipe, threshold = 100 }) {
  const save = card.querySelector(".stamp.save");
  const pass = card.querySelector(".stamp.pass");
  let start = null;
  let dx = 0;
  let done = false;

  const stamps = (x) => {
    if (save) save.style.opacity = String(Math.max(0, Math.min(1, x / threshold)));
    if (pass) pass.style.opacity = String(Math.max(0, Math.min(1, -x / threshold)));
  };

  card.addEventListener("pointerdown", (e) => {
    if (done || e.button !== 0 || e.target.closest("a, button")) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dx = 0;
    card.setPointerCapture(e.pointerId);
    card.classList.add("dragging");
  });

  card.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    dx = e.clientX - start.x;
    const dy = (e.clientY - start.y) * 0.25;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;
    stamps(dx);
  });

  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    card.classList.remove("dragging");
    if (Math.abs(dx) >= threshold) fling(dx > 0 ? "right" : "left");
    else {
      card.style.transform = "";
      stamps(0);
    }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);

  function fling(direction) {
    if (done) return;
    done = true;
    const sign = direction === "right" ? 1 : -1;
    stamps(sign * threshold);
    if (reduceMotion()) {
      onSwipe(direction);
      return;
    }
    card.classList.add("flying");
    card.style.transform = `translate(${sign * (window.innerWidth * 0.9 + 200)}px, 40px) rotate(${sign * 24}deg)`;
    card.style.opacity = "0";
    setTimeout(() => onSwipe(direction), 280);
  }

  return { fling };
}
