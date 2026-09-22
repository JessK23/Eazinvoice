(function () {
  const SEARCH_ITEMS = [
    { title: "Home", detail: "EazInvoice overview", url: "./index.html", keywords: "home start overview" },
    { title: "About EazInvoice", detail: "Who the product is for", url: "./index.html#about", keywords: "about msme freelancer business" },
    { title: "Workflow", detail: "See how EazInvoice works", url: "./index.html#workflow", keywords: "workflow onboarding process" },
    { title: "Features", detail: "Invoices, PO/WO, reports and AI", url: "./index.html#features", keywords: "features invoice po wo reports ai" },
    { title: "Pricing and plans", detail: "Free, Standard, Pro and Business", url: "./index.html#pricing", keywords: "pricing plans subscription upgrade standard pro business" },
    { title: "Login", detail: "Sign in to your account", url: "./auth.html?tab=login", keywords: "login sign in otp account" },
    { title: "Create account", detail: "Register for EazInvoice", url: "./auth.html?tab=signup", keywords: "signup register create account" },
    { title: "My Account", detail: "Profile, business details and plan", url: "./access.html", keywords: "account profile business subscription", protected: true },
    { title: "Create invoice", detail: "Create or resume an invoice", url: "./invoice.html", keywords: "invoice gst tax draft customer", protected: true },
    { title: "Purchase / Work Order", detail: "Create a PO or WO", url: "./invoice.html?type=po", keywords: "purchase order work order po wo vendor", protected: true },
    { title: "Reports dashboard", detail: "Revenue, expenses and business reports", url: "./dashboard.html#reports", keywords: "dashboard reports revenue profit loss expense", protected: true },
    { title: "AI Agent", detail: "AI-assisted drafts and reports", url: "./dashboard.html#ai-agent", keywords: "ai agent assistant invoice po report", protected: true },
    { title: "Customers", detail: "Customer records", url: "./dashboard.html#customers", keywords: "customers clients records", protected: true },
    { title: "Vendors", detail: "Vendor records", url: "./dashboard.html#vendors", keywords: "vendors suppliers records", protected: true },
    { title: "Business workspace", detail: "Team, approvals and integrations", url: "./dashboard.html#business-workspace", keywords: "business team approvals smtp api gateway", protected: true },
    { title: "Subscription", detail: "Current plan and upgrade options", url: "./subscription.html", keywords: "subscription billing plan upgrade", protected: true },
    { title: "Web app guide", detail: "EazInvoice help and SOP", url: "./user-manual-web.html", keywords: "help manual sop guide instructions" },
    { title: "Android app guide", detail: "Mobile app help and SOP", url: "./user-manual-android.html", keywords: "android mobile app help guide" },
    { title: "Privacy Policy", detail: "How EazInvoice handles information", url: "./privacy.html", keywords: "privacy data security delete account policy" },
  ];

  function hasSession() {
    return Boolean(
      localStorage.getItem("eazinvoice_token")
      || sessionStorage.getItem("eazinvoice_token")
      || localStorage.getItem("eazinvoice_session")
      || document.cookie.split(";").some((part) => part.trim().startsWith("eazinvoice_token=")),
    );
  }

  function createSearch() {
    if (document.querySelector(".global-search")) return;

    const wrap = document.createElement("div");
    wrap.className = "global-search";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "global-search-button";
    button.setAttribute("aria-label", "Search EazInvoice");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<span aria-hidden="true">⌕</span><span class="global-search-label">Search</span>';

    const backdrop = document.createElement("div");
    backdrop.className = "global-search-backdrop";
    backdrop.hidden = true;

    const dialog = document.createElement("section");
    dialog.className = "global-search-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Search EazInvoice pages and features");

    const heading = document.createElement("div");
    heading.className = "global-search-heading";
    const title = document.createElement("strong");
    title.textContent = "Find a page or feature";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "global-search-close";
    close.setAttribute("aria-label", "Close search");
    close.textContent = "×";
    heading.append(title, close);

    const input = document.createElement("input");
    input.type = "search";
    input.className = "global-search-input";
    input.placeholder = "Search invoices, reports, privacy, help...";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Search EazInvoice");

    const results = document.createElement("div");
    results.className = "global-search-results";
    results.setAttribute("role", "listbox");

    const render = () => {
      const query = input.value.trim().toLowerCase();
      const authenticated = hasSession();
      const matches = SEARCH_ITEMS.filter((item) => {
        const haystack = `${item.title} ${item.detail} ${item.keywords}`.toLowerCase();
        return !query || haystack.includes(query);
      }).slice(0, 8);

      results.replaceChildren();
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "global-search-empty";
        empty.textContent = "No matching page or feature found.";
        results.append(empty);
        return;
      }

      matches.forEach((item) => {
        const link = document.createElement("a");
        link.className = "global-search-result";
        link.href = item.protected && !authenticated ? "./auth.html?tab=login" : item.url;
        link.setAttribute("role", "option");
        const copy = document.createElement("span");
        const name = document.createElement("strong");
        const detail = document.createElement("small");
        name.textContent = item.title;
        detail.textContent = item.protected && !authenticated
          ? `${item.detail} · Login required`
          : item.detail;
        copy.append(name, detail);
        const arrow = document.createElement("b");
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        link.append(copy, arrow);
        results.append(link);
      });
    };

    const open = () => {
      backdrop.hidden = false;
      document.body.classList.add("search-open");
      button.setAttribute("aria-expanded", "true");
      render();
      window.setTimeout(() => input.focus(), 0);
    };

    const dismiss = () => {
      backdrop.hidden = true;
      document.body.classList.remove("search-open");
      button.setAttribute("aria-expanded", "false");
      button.focus();
    };

    input.addEventListener("input", render);
    button.addEventListener("click", open);
    close.addEventListener("click", dismiss);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) dismiss();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !backdrop.hidden) dismiss();
      if (
        (event.key === "/" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k"))
        && !event.altKey
        && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        open();
      }
    });

    dialog.append(heading, input, results);
    backdrop.append(dialog);
    wrap.append(button);
    document.body.append(backdrop);

    const headerNav = document.querySelector(".topnav, .landing-nav");
    if (headerNav) {
      headerNav.prepend(wrap);
    } else {
      document.body.append(wrap);
      wrap.classList.add("global-search-floating");
    }
  }

  function createPrivacyFooterLink() {
    if (document.querySelector('a[href*="privacy.html"]')) return;
    const footer = document.querySelector("footer");
    if (!footer) return;
    const link = document.createElement("a");
    link.href = "./privacy.html";
    link.className = "shared-privacy-link";
    link.textContent = "Privacy";
    footer.append(link);
  }

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
    createSearch();
    createPrivacyFooterLink();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
