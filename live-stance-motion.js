/* Classroom Interactive v2.36.6 — live stance compositor-motion renderer.
   Existing RAF / critically damped timeline is preserved. Each moving visual
   now uses transform (and opacity), not left/width updates per animation frame.
   Updates affect presentation ONLY: never Session tallies or the backend. */
(() => {
  "use strict";
  const motions = new WeakMap();
  const visuals = new WeakMap();
  const MIN = 4;
  const MAX = 96;
  const RESPONSE = 8.2;
  const STOP_DISTANCE = 0.05;
  const STOP_SPEED = 0.55;

  const clamp = value => {
    const n = Number(value);
    return Math.max(MIN, Math.min(MAX, Number.isFinite(n) ? n : 50));
  };
  const prefersReducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  function visualFor(board) {
    const cached = visuals.get(board);
    if (cached?.track?.isConnected && board.contains(cached.track)) return cached;
    const track = board.querySelector?.(".live-stance-motion-track");
    const rope = board.querySelector?.(".live-stance-rope");
    const knot = track?.querySelector(".live-stance-knot");
    const left = rope?.querySelector(".live-stance-band.left");
    const right = rope?.querySelector(".live-stance-band.right");
    if (!(track && rope && knot && left && right)) {
      // Legacy markup is still usable; it simply retains the old variable driver.
      board.classList.remove("motion-composited");
      return null;
    }
    const old = visuals.get(board);
    if (old?.track === track && old.rope === rope) return old;
    old?.observer?.disconnect();
    const visual = {
      track, rope, knot, left, right,
      wave:track.querySelector(".live-stance-tension-wave"),
      width:track.clientWidth,
      position:clamp(Number.parseFloat(board.style.getPropertyValue("--tug-position"))),
      observer:null
    };
    if (typeof ResizeObserver !== "undefined") {
      visual.observer = new ResizeObserver(entries => {
        if (!entries.length || visuals.get(board) !== visual) return;
        visual.width = entries[0].contentRect.width;
        // Responsive recalculation is event-driven, never measured inside RAF.
        renderComposite(visual, visual.position, 0);
      });
      visual.observer.observe(track);
    }
    board.classList.add("motion-composited");
    visuals.set(board, visual);
    return visual;
  }

  function renderComposite(visual, position, velocity) {
    const share = (clamp(position)-MIN)/(MAX-MIN);
    const offset = share * visual.width;
    const tilt = Math.max(-1.8, Math.min(1.8, velocity * .009));
    const energy = Math.min(.68, Math.abs(velocity)/180);
    visual.position = clamp(position);
    // Animations are independently promoted to compositor-friendly transforms.
    visual.left.style.transform = `scaleX(${share.toFixed(6)})`;
    visual.right.style.transform = `scaleX(${(1-share).toFixed(6)})`;
    visual.knot.style.transform = `translate3d(calc(${offset.toFixed(3)}px - 50%),-50%,0) rotate(${tilt.toFixed(2)}deg)`;
    if (visual.wave) {
      visual.wave.style.transform = `translate3d(calc(${offset.toFixed(3)}px - 50%),-50%,0)`;
      visual.wave.style.opacity = energy.toFixed(3);
    }
  }

  function paint(board, position, velocity=0, {finished=false}={}) {
    const x = clamp(position);
    const visual = visualFor(board);
    if (visual) {
      renderComposite(visual,x,velocity);
    }
    // Public variables remain compatible with older templates and fallback CSS.
    // Keep expensive board-wide custom property updates out of animation frames.
    if (!visual || finished) {
      board.style.setProperty("--tug-position",`${x.toFixed(4)}%`);
      board.style.setProperty("--tug-split",`${(((x-MIN)/(MAX-MIN))*100).toFixed(4)}%`);
      board.style.setProperty("--tug-energy",(Math.min(.68,Math.abs(velocity)/180)).toFixed(3));
      board.style.setProperty("--tug-tilt",`${Math.max(-1.8,Math.min(1.8,velocity*.009)).toFixed(2)}deg`);
    }
  }

  function release(board) {
    board.classList.remove("is-pulling","is-swinging");
    delete board.dataset.pullDirection;
  }

  function reset(board, position=50) {
    if (!board) return;
    const previous = motions.get(board);
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    motions.delete(board);
    paint(board,position,0,{finished:true});
    release(board);
  }

  function move(board,position,{active=true}={}) {
    if (!board) return;
    const target=clamp(position);
    if (!active || prefersReducedMotion() || document.hidden) {
      reset(board,target);
      return;
    }
    let motion=motions.get(board);
    if (!motion) {
      const visual=visualFor(board);
      const previous=Number.parseFloat(board.style.getPropertyValue("--tug-position"));
      const current=clamp(Number.isFinite(visual?.position) ? visual.position : previous);
      motion={current,target:current,velocity:0,last:null,frame:0};
      motions.set(board,motion);
      paint(board,current,0,{finished:true});
    }
    const change=target-motion.target;
    if (Math.abs(change)<.001) return;
    motion.target=target;
    if (Math.abs(change)>.08) {
      board.dataset.pullDirection=change>0?"blue":"red";
      board.classList.add("is-pulling");
      board.classList.toggle("is-swinging",Math.abs(change)>=20);
    }
    if (motion.frame) return;
    motion.last=performance.now();
    const tick=now => {
      motion.frame=0;
      if (prefersReducedMotion() || document.hidden) {
        reset(board,motion.target);
        return;
      }
      const dt=Math.max(0,Math.min(.064,(now-motion.last)/1000));
      motion.last=now;
      const displacement=motion.current-motion.target;
      const residualVelocity=motion.velocity+RESPONSE*displacement;
      const decay=Math.exp(-RESPONSE*dt);
      motion.current=motion.target+(displacement+residualVelocity*dt)*decay;
      motion.velocity=(motion.velocity-RESPONSE*residualVelocity*dt)*decay;
      if (motion.current<=MIN || motion.current>=MAX) {
        motion.current=clamp(motion.current);
        motion.velocity=0;
      }
      if (Math.abs(motion.target-motion.current)<=STOP_DISTANCE &&
          Math.abs(motion.velocity)<=STOP_SPEED) {
        motion.current=motion.target;
        motion.velocity=0;
        paint(board,motion.current,0,{finished:true});
        release(board);
      } else {
        paint(board,motion.current,motion.velocity);
        motion.frame=requestAnimationFrame(tick);
      }
    };
    motion.frame=requestAnimationFrame(tick);
  }

  window.LiveStanceMotion=Object.freeze({reset,move});
})();
