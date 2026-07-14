(() => {
  if (window.__goylordRippleInitialized) {
    return;
  }
  window.__goylordRippleInitialized = true;

  function addRippleEffect(element) {
    if (!element || element.dataset.rippleBound === "1") {
      return;
    }

    element.classList.add("ripple");
    element.dataset.rippleBound = "1";

    element.addEventListener("click", function (e) {
      this.classList.remove("ripple-active");

      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.style.setProperty("--x", x + "px");
      this.style.setProperty("--y", y + "px");

      void this.offsetWidth;

      this.classList.add("ripple-active");

      setTimeout(() => {
        this.classList.remove("ripple-active");
      }, 600);
    });
  }

  function initRippleEffects() {
    document
      .querySelectorAll("button:not(.no-ripple), .button:not(.no-ripple)")
      .forEach((btn) => {
        addRippleEffect(btn);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRippleEffects, { once: true });
  } else {
    initRippleEffects();
  }

  window.addRippleEffect = addRippleEffect;
})();
