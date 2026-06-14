(function () {
  function closeMenu(button, nav) {
    nav.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  }

  function initHeaderMenu(header, index) {
    const nav = header.querySelector(".topnav, .landing-nav");
    if (!nav || header.querySelector(".nav-menu-toggle")) return;

    const navId = nav.id || `eazinvoice-nav-${index + 1}`;
    nav.id = navId;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-menu-toggle";
    button.setAttribute("aria-label", "Open menu");
    button.setAttribute("aria-controls", navId);
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = "<span></span><span></span><span></span>";

    header.insertBefore(button, nav);

    button.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(isOpen));
    });

    nav.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".profile-button")) return;
      if (target.closest("a, button")) closeMenu(button, nav);
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (header.contains(target) || !nav.classList.contains("is-open")) return;
      closeMenu(button, nav);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960 && nav.classList.contains("is-open")) {
        closeMenu(button, nav);
      }
    });
  }

  function init() {
    document.querySelectorAll(".topbar, .landing-header").forEach(initHeaderMenu);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
