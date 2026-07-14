(function () {
  try {
    var h = document.documentElement, L = localStorage;
    h.classList.add(L.getItem("sb_mode") === "sidebar" ? "nav-pre-sidebar" : "nav-pre-topbar");
    if (L.getItem("sb_collapsed") === "true") h.classList.add("nav-pre-collapsed");
    if (L.getItem("nav_hidden") === "true") h.classList.add("nav-pre-hidden");
  } catch (e) {}
})();
