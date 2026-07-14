(function () {
  const menus = [
    {
      btn: document.getElementById("rdRecordingSettingsBtn"),
      menu: document.getElementById("rdRecordingSettingsMenu"),
      wrap: document.getElementById("rdRecordingSettingsWrap"),
    },
    {
      btn: document.getElementById("rdSettingsBtn"),
      menu: document.getElementById("rdSettingsMenu"),
      wrap: document.getElementById("rdSettingsWrap"),
    },
  ].filter((item) => item.btn && item.menu && item.wrap);

  function setOpen(item, open) {
    item.menu.classList.toggle("hidden", !open);
    item.btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeAll(except) {
    for (const item of menus) {
      if (item !== except) setOpen(item, false);
    }
  }

  for (const item of menus) {
    item.btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nextOpen = item.menu.classList.contains("hidden");
      closeAll(item);
      setOpen(item, nextOpen);
    });
    item.menu.addEventListener("click", (e) => e.stopPropagation());
  }

  document.addEventListener("click", () => closeAll());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
})();
