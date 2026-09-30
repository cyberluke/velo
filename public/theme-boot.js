// Zero-flash theme boot (NAI E-Mail).
//
// Runs synchronously in <head> before first paint so every window — including
// the pop-out thread/composer windows, which open visible — starts with the
// theme the last session applied instead of flashing the default. The
// useDocumentTheme hook keeps this snapshot fresh on every theme apply.
// Deliberately vanilla: no imports, no module — it must run during HTML parse.
(function () {
  try {
    var raw = localStorage.getItem("naiemail-theme");
    if (!raw) return; // first run — index.html's default class="dark" applies
    var snapshot = JSON.parse(raw);
    var root = document.documentElement;
    if (snapshot.mode === "light") root.classList.remove("dark");
    else root.classList.add("dark");
    if (snapshot.themeId) root.setAttribute("data-theme", snapshot.themeId);
    var vars = snapshot.vars;
    if (vars && typeof vars === "object") {
      for (var key in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
          root.style.setProperty(key, vars[key]);
        }
      }
    }
  } catch (err) {
    // Never block first paint — the app applies the full theme on mount.
  }
})();