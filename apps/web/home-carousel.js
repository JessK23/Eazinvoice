(() => {
  const carousel = document.querySelector("[data-carousel]");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll("[data-carousel-slide]")];
  const selectors = [...document.querySelectorAll("[data-carousel-select]")];
  const dots = [...carousel.querySelectorAll("[data-carousel-dot]")];
  const previous = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  const status = carousel.querySelector("[data-carousel-status]");
  const labels = ["Workspace", "PO / WO", "AI Agent", "Payments"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let timer = null;
  let pointerStart = null;
  let interactionPaused = false;

  function normalize(index) {
    return (index + slides.length) % slides.length;
  }

  function showSlide(index, { announce = true } = {}) {
    activeIndex = normalize(index);
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.querySelectorAll("a, button").forEach((control) => {
        if (active) control.removeAttribute("tabindex");
        else control.setAttribute("tabindex", "-1");
      });
    });
    selectors.forEach((selector, selectorIndex) => {
      const active = selectorIndex === activeIndex;
      selector.classList.toggle("is-active", active);
      selector.setAttribute("aria-selected", String(active));
      selector.tabIndex = active ? 0 : -1;
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeIndex;
      dot.classList.toggle("is-active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    if (status) {
      status.textContent = `${labels[activeIndex]}, slide ${activeIndex + 1} of ${slides.length}`;
      status.setAttribute("aria-live", announce ? "polite" : "off");
    }
  }

  function stopRotation() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function startRotation() {
    stopRotation();
    if (reducedMotion.matches || interactionPaused || slides.length < 2) return;
    timer = window.setInterval(() => showSlide(activeIndex + 1, { announce: false }), 6000);
  }

  function select(index, { focus = false } = {}) {
    showSlide(index);
    if (focus) selectors[activeIndex]?.focus();
    startRotation();
  }

  previous?.addEventListener("click", () => select(activeIndex - 1));
  next?.addEventListener("click", () => select(activeIndex + 1));
  selectors.forEach((selector, index) => {
    selector.addEventListener("click", () => select(index));
    selector.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") select(0, { focus: true });
      else if (event.key === "End") select(slides.length - 1, { focus: true });
      else select(activeIndex + (event.key === "ArrowRight" ? 1 : -1), { focus: true });
    });
  });
  dots.forEach((dot, index) => dot.addEventListener("click", () => select(index)));

  carousel.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    select(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
  });

  carousel.addEventListener("mouseenter", () => {
    interactionPaused = true;
    stopRotation();
  });
  carousel.addEventListener("mouseleave", () => {
    interactionPaused = false;
    startRotation();
  });
  carousel.addEventListener("focusin", stopRotation);
  carousel.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && carousel.contains(event.relatedTarget)) return;
    startRotation();
  });

  carousel.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    pointerStart = event.clientX;
    stopRotation();
  });
  carousel.addEventListener("pointerup", (event) => {
    if (pointerStart === null) return;
    const distance = event.clientX - pointerStart;
    pointerStart = null;
    if (Math.abs(distance) >= 48) select(activeIndex + (distance < 0 ? 1 : -1));
    else startRotation();
  });
  carousel.addEventListener("pointercancel", () => {
    pointerStart = null;
    startRotation();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRotation();
    else startRotation();
  });
  reducedMotion.addEventListener?.("change", startRotation);

  showSlide(0, { announce: false });
  startRotation();
})();
