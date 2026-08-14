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

  const tradeoffVisual = document.querySelector("#tradeoffVisual");
  const tradeoffSlider = document.querySelector("#wSlider");
  const tradeoffWeight = document.querySelector("#tradeoffArtWeight");
  const tradeoffPivot = document.querySelector("#tradeoffArtPivot");
  const tradeoffOutline = document.querySelector(".tradeoff-state-ghost");
  const tradeoffAxis = document.querySelector(".tradeoff-state-axis");
  const tradeoffMix = document.querySelector("#tradeoffArtMix");
  const tradeoffTargetLabel = document.querySelector("#tradeoffArtTargetLabel");
  const weightTargetLabel = document.querySelector("#weightTargetLabel");
  const tradeoffTiles = Array.from(document.querySelectorAll(".tradeoff-tile"));

  if (tradeoffVisual && tradeoffSlider && tradeoffWeight && tradeoffPivot && tradeoffTiles.length) {
    const updateTradeoffVisual = () => {
      const weight = Math.min(1, Math.max(0, Number.parseFloat(tradeoffSlider.value) || 0));
      const fragmentation = 1 - weight;

      tradeoffTiles.forEach((tile) => {
        const shiftX = Number.parseFloat(tile.dataset.shiftX) || 0;
        const shiftY = Number.parseFloat(tile.dataset.shiftY) || 0;
        const rotation = Number.parseFloat(tile.dataset.rotate) || 0;
        tile.style.transform = `translate(${(shiftX * fragmentation).toFixed(2)}px, ${(shiftY * fragmentation).toFixed(2)}px) rotate(${(rotation * fragmentation).toFixed(2)}deg)`;
        tile.style.strokeOpacity = (1 - weight * 0.6).toFixed(2);
      });

      tradeoffPivot.setAttribute("cx", (76 + 408 * weight).toFixed(2));
      tradeoffWeight.textContent = `w = ${weight.toFixed(3)}`;
      if (tradeoffOutline) {
        tradeoffOutline.style.opacity = (0.18 + weight * 0.72).toFixed(2);
        tradeoffOutline.style.strokeDasharray = weight > 0.85 ? "none" : "8 11";
      }
      if (tradeoffAxis) tradeoffAxis.style.opacity = (0.35 + weight * 0.65).toFixed(2);
      if (tradeoffMix) {
        tradeoffMix.textContent = `${Math.round((1 - weight) * 100)}% local · ${Math.round(weight * 100)}% statewide`;
      }
      if (tradeoffTargetLabel && weightTargetLabel) {
        tradeoffTargetLabel.textContent = weightTargetLabel.textContent.trim();
      }
      tradeoffVisual.dataset.regime = weight < 0.34 ? "local" : weight > 0.66 ? "statewide" : "balanced";
    };

    tradeoffSlider.addEventListener("input", updateTradeoffVisual);
    tradeoffSlider.addEventListener("change", updateTradeoffVisual);

    const weightOutput = document.querySelector("#wValue");
    if (weightOutput && "MutationObserver" in window) {
      const weightObserver = new MutationObserver(updateTradeoffVisual);
      weightObserver.observe(weightOutput, { childList: true, subtree: true, characterData: true });
    }

    if (weightTargetLabel && "MutationObserver" in window) {
      const targetObserver = new MutationObserver(updateTradeoffVisual);
      targetObserver.observe(weightTargetLabel, { childList: true, subtree: true, characterData: true });
    }

    updateTradeoffVisual();
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
