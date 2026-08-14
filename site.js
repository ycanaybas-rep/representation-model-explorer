"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const scrollProgress = document.querySelector("#scrollProgress");
  let progressFrame = 0;

  const updateScrollProgress = () => {
    progressFrame = 0;
    if (!scrollProgress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    scrollProgress.style.transform = `scaleX(${progress})`;
  };

  const requestProgressUpdate = () => {
    if (progressFrame) return;
    progressFrame = window.requestAnimationFrame(updateScrollProgress);
  };

  updateScrollProgress();
  window.addEventListener("scroll", requestProgressUpdate, { passive: true });
  window.addEventListener("resize", requestProgressUpdate);

  const hero = document.querySelector(".explorer-hero");
  const heroAnnotations = hero?.querySelectorAll(
    ".hero-local-oval, .hero-statewide-underline",
  );
  if (hero && heroAnnotations?.length) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let annotationsRevealed = false;
    const revealAnnotations = () => {
      if (annotationsRevealed) return;
      annotationsRevealed = true;
      document.body.classList.add("hero-annotations-revealed");
      window.removeEventListener("scroll", handleAnnotationScroll);
    };
    const handleAnnotationScroll = () => {
      if (window.scrollY >= Math.min(72, Math.max(24, hero.offsetHeight * 0.08))) {
        revealAnnotations();
      }
    };

    if (reducedMotion || window.scrollY > 8) {
      revealAnnotations();
    } else {
      document.body.classList.add("hero-annotations-ready");
      window.addEventListener("scroll", handleAnnotationScroll, { passive: true });
    }
  }

  if (!window.katex) return;

  document.querySelectorAll("[data-tex]").forEach((element) => {
    const tex = element.dataset.tex;
    if (!tex) return;

    try {
      window.katex.render(tex, element, {
        displayMode: element.dataset.display === "true",
        throwOnError: true,
        strict: false,
        trust: false,
      });
      element.dataset.mathRendered = "true";
    } catch (error) {
      element.textContent = tex;
      element.classList.add("math-render-error");
    }
  });
});
