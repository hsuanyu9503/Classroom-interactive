/* V2.35.4 — Smooth, frame-rate independent live stance motion.
   One critically damped position drives both coloured segments and the knot.
   Interruptions keep their current position and velocity; no polling restart.
   This file changes presentation only, never Session tallies. */
(() => {
  "use strict";
  const motions = new WeakMap();
  const MIN = 4;
  const MAX = 96;
  const RESPONSE = 8.2; // critically damped response: smooth, no oscillation on a single vote change
  const STOP_DISTANCE = 0.05;
  const STOP_SPEED = 0.55;

  function clampPosition(value) {
    const n = Number(value);
    return Math.max(MIN, Math.min(MAX, Number.isFinite(n) ? n : 50));
  }

  function reducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  function paint(board, position, velocity = 0) {
    const x = clampPosition(position);
    const split = ((x - MIN) / (MAX - MIN)) * 100;
    // A gentle, proportional visual cue rather than jittery full-intensity pulses.
    const energy = Math.min(0.68, Math.abs(velocity) / 180);
    board.style.setProperty("--tug-position", `${x.toFixed(4)}%`);
    board.style.setProperty("--tug-split", `${split.toFixed(4)}%`);
    board.style.setProperty("--tug-energy", energy.toFixed(3));
    board.style.setProperty("--tug-tilt", `${Math.max(-1.8, Math.min(1.8, velocity * 0.009)).toFixed(2)}deg`);
  }

  function release(board) {
    board.classList.remove("is-pulling", "is-swinging");
    delete board.dataset.pullDirection;
  }

  function reset(board, position = 50) {
    if (!board) return;
    const previous = motions.get(board);
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    motions.delete(board);
    paint(board, position);
    release(board);
  }

  function move(board, position, {active = true} = {}) {
    if (!board) return;
    const target = clampPosition(position);
    if (!active || reducedMotion() || document.hidden) {
      reset(board, target);
      return;
    }

    let motion = motions.get(board);
    if (!motion) {
      const cssPosition = Number.parseFloat(board.style.getPropertyValue("--tug-position"));
      const current = clampPosition(Number.isFinite(cssPosition) ? cssPosition : 50);
      motion = {current, target:current, velocity:0, last:null, frame:0};
      motions.set(board, motion);
    }
    const change = target - motion.target;
    // Repeated polls must not restart motion or trigger extra visual effects.
    if (Math.abs(change) < 0.001) return;
    motion.target = target;
    if (Math.abs(change) > 0.08) {
      board.dataset.pullDirection = change > 0 ? "blue" : "red";
      board.classList.add("is-pulling");
      // Keep this class only for substantial changes; no additional position wobble.
      board.classList.toggle("is-swinging", Math.abs(change) >= 20);
    }
    if (motion.frame) return;

    motion.last = performance.now(); // RAF timestamps share this clock, at both 60 and 120 Hz
    const tick = now => {
      motion.frame = 0;
      if (reducedMotion() || document.hidden) {
        reset(board, motion.target);
        return;
      }
      // Do not fake 8 ms on a 120 Hz display; integrate actual elapsed time.
      // Clamp long gaps (e.g. resuming a background tab) rather than jumping frames.
      const dt = Math.max(0, Math.min(0.064, (now-motion.last)/1000));
      motion.last = now;

      // Closed-form critically damped spring. Unlike variable-step Euler,
      // it is frame-rate independent and does not overshoot on a single step.
      const displacement = motion.current - motion.target;
      const residualVelocity = motion.velocity + RESPONSE * displacement;
      const decay = Math.exp(-RESPONSE * dt);
      motion.current = motion.target + (displacement + residualVelocity * dt) * decay;
      motion.velocity = (motion.velocity - RESPONSE * residualVelocity * dt) * decay;

      if (motion.current <= MIN || motion.current >= MAX) {
        motion.current = clampPosition(motion.current);
        motion.velocity = 0;
      }
      if (Math.abs(motion.target-motion.current) <= STOP_DISTANCE &&
          Math.abs(motion.velocity) <= STOP_SPEED) {
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
