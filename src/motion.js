import gsap from "gsap";

// Shared, minimal entrance-motion helpers. Every call is a no-op under
// prefers-reduced-motion so the dashboard stays accessible.
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function fadeInUp(target, { delay = 0, duration = 0.45, y = 10 } = {}) {
  if (!target || prefersReducedMotion()) return;
  gsap.fromTo(target, { opacity: 0, y }, { opacity: 1, y: 0, duration, delay, ease: "power2.out" });
}

export function staggerFadeInUp(targets, { stagger = 0.05, duration = 0.4, y = 10, delay = 0 } = {}) {
  if (!targets || (Array.isArray(targets) ? !targets.length : !targets.length) || prefersReducedMotion()) return;
  gsap.fromTo(targets, { opacity: 0, y }, { opacity: 1, y: 0, duration, delay, stagger, ease: "power2.out" });
}

export { gsap };
