/* V2.35.3 — Shared, interruptible tug-of-war spring for teacher and Course views.
   Visuals are driven by the same position: blue/red rope split and centre knot.
   No network calls, persistent loops, or changes to Session data. */
(() => {
  "use strict";
  const activeBoards = new WeakMap();
  const MIN = 4;
  const MAX = 96;
  const STIFFNESS = 220;      // spring pull (seconds^-2)
  const DAMPING = 20;         // settling without excessive wobble (seconds^-1)
  const STOP_DISTANCE = 0.045;
  const STOP_SPEED = 0.7;

  const clampPosition = value => {
    const number = Number(value);
    return Math.max(MIN, Math.min(MAX, Number.isFinite(number) ? number : 50));
  };
  const reducedMotion = () =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  function paint(board, position, velocity = 0) {
    if (!board) return;
    const absolute = clampPosition(position);
    const split = (absolute - MIN) / (MAX - MIN) * 100;
    const energy = Math.min(1, Math.abs(velocity) / 165);
    board.style.setProperty("--tug-position", `${absolute.toFixed(3)}%`);
    board.style.setProperty("--tug-split", `${split.toFixed(3)}%`);
    board.style.setProperty("--tug-energy", energy.toFixed(3));
    board.style.setProperty("--tug-tilt", `${Math.max(-5, Math.min(5, velocity * 0.035)).toFixed(2)}deg`);
  }

  function release(board) {
    board.classList.remove("is-pulling", "is-swinging");
    delete board.dataset.pullDirection;
  }

  function reset(board, position = 50) {
    if (!board) return;
    const previous = activeBoards.get(board);
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    activeBoards.delete(board);
    paint(board, position);
    release(board);
  }

  function move(board, position, {active = true} = {}) {
    if (!board) return;
    const target = clampPosition(position);
    if (!active || reducedMotion()) {
      reset(board, target);
      return;
    }
    let motion = activeBoards.get(board);
    if (!motion) {
      const current = clampPosition(parseFloat(board.style.getPropertyValue("--tug-position")));
      motion = {current, target:current, velocity:0, last:0, frame:0};
      activeBoards.set(board, motion);
    }
    const change = target - motion.target;
    // Polling the same tally must not restart or amplify the animation.
    if (Math.abs(change) < 0.001) return;
    motion.target = target;
    if (Math.abs(change) > 0.08) {
      board.dataset.pullDirection = change > 0 ? "blue" : "red";
      board.classList.add("is-pulling");
      board.classList.toggle("is-swinging", Math.abs(change) >= 10);
    }
    if (motion.frame) return; // New votes change the target of the current spring.

    const tick = now => {
      motion.frame = 0;
      const dt = motion.last ? Math.max(0.008, Math.min(0.04, (now-motion.last) / 1000)) : 1 / 60;
      motion.last = now;
      const force = (motion.target-motion.current) * STIFFNESS - motion.velocity * DAMPING;
      motion.velocity += force * dt;
      motion.current += motion.velocity * dt;
      // Never allow the knot to leave the rope, including a 100%-to-0% switch.
      if (motion.current <= MIN) { motion.current=MIN; motion.velocity=Math.max(0,motion.velocity); }
      if (motion.current >= MAX) { motion.current=MAX; motion.velocity=Math.min(0,motion.velocity); }
      const settled = Math.abs(motion.target-motion.current) < STOP_DISTANCE &&
                      Math.abs(motion.velocity) < STOP_SPEED;
      if (settled) {
        motion.current = motion.target;
        motion.velocity = 0;
        paint(board, motion.current);
        release(board);
      } else {
        paint(board, motion.current, motion.velocity);
        motion.frame = requestAnimationFrame(tick);
      }
    };
    motion.frame = requestAnimationFrame(tick);
  }

  window.LiveStanceMotion = Object.freeze({reset, move});
})();
