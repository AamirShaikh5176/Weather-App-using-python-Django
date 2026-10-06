/* ============================================================
   AtmosWeather — app.js
   Application shell: state, settings, theme, search, favorites,
   recents, geolocation, navigation, PWA registration.
   ============================================================ */

(function () {
  "use strict";

  var STORE = {
    settings: "atmos.settings",
    favorites: "atmos.favorites",
    recents: "atmos.recents",
    lastPlace: "atmos.lastPlace"
  };

  var settings = {
    temp: "c",
    wind: "kmh",
    pressure: "hpa",
    vis: "km",
    theme: "system"
  };

  var favorites = [];
  var recents = [];
  var currentPlace = null;
  var activeView = "home";

  var $ = function (sel) { return document.querySelector(sel); };
  var el = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------
     Storage helpers
     --------------------------------------------------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------------------------------------------------------
     Theme
     --------------------------------------------------------- */

  var themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.theme);
    var darkActive = settings.theme === "dark" || (settings.theme === "system" && themeQuery.matches);
    document.body.classList.toggle("dark-active", darkActive);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", darkActive ? "#0a1230" : "#7fb8e6");
    syncThemeIcon();
  }

  function isLightTheme() {
    return settings.theme === "light" || (settings.theme === "system" && !themeQuery.matches);
  }

  var THEME_ICON_MOON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M19.5 13.5A8 8 0 0 1 10.5 4.5a8 8 0 1 0 9 9Z"/></svg>';
  var THEME_ICON_SUN =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/></svg>';
  var THEME_ICON_SYSTEM =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 3.5a8.5 8.5 0 0 1 0 17" fill="currentColor" stroke="none" opacity=".85"/></svg>';

  function syncThemeIcon() {
    var btn = document.getElementById("theme-btn");
    if (!btn) return;
    btn.innerHTML = settings.theme === "light" ? THEME_ICON_MOON :
      settings.theme === "dark" ? THEME_ICON_SUN : THEME_ICON_SYSTEM;
    btn.setAttribute("aria-label", "Theme: " + settings.theme + " (click to change)");
  }

  themeQuery.addEventListener && themeQuery.addEventListener("change", function () {
    if (settings.theme === "system") applyTheme();
  });

  /* ---------------------------------------------------------
     Toast / skeleton / error
     --------------------------------------------------------- */

  var toastTimer = null;
  function toast(msg) {
    var t = el("toast");
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.hidden = true; }, 350);
    }, 3600);
  }

  function showSkeleton() {
    el("skeleton").hidden = false;
    el("error-state").hidden = true;
    if (!WX.state.data) el("content").hidden = true;
  }

  function hideSkeleton() {
    el("skeleton").hidden = true;
    if (el("error-state").hidden) el("content").hidden = false;
  }

  function showError(message) {
    el("skeleton").hidden = true;
    el("content").hidden = true;
    el("error-state").hidden = false;
    el("error-message").textContent = message;
  }

  /* ---------------------------------------------------------
     Favorites / recents
     --------------------------------------------------------- */

  function placeKey(p) {
    return (p.lat !== undefined && p.lat !== null)
      ? p.lat.toFixed(2) + "," + p.lon.toFixed(2)
      : (p.name + "").toLowerCase();
  }

  function isFavorite(place) {
    return favorites.some(function (f) { return placeKey(f) === placeKey(place); });
  }

  function saveRecent(place) {
    if (!place || !place.name) return;
    recents = recents.filter(function (r) { return placeKey(r) !== placeKey(place); });
    recents.unshift(place);
    recents = recents.slice(0, 8);
    writeJSON(STORE.recents, recents);
  }

  function toggleFavorite() {
    if (!currentPlace) return;
    if (isFavorite(currentPlace)) {
      favorites = favorites.filter(function (f) { return placeKey(f) !== placeKey(currentPlace); });
      toast("Removed from favorites.");
    } else {
      favorites.unshift(currentPlace);
      toast("Added " + currentPlace.name + " to favorites.");
    }
    writeJSON(STORE.favorites, favorites);
    syncFavoriteButton();
    renderLocationsView();
  }

  function syncFavoriteButton() {
    var btn = el("fav-toggle");
    if (!currentPlace) { btn.hidden = true; return; }
    btn.hidden = false;
    var fav = isFavorite(currentPlace);
    btn.setAttribute("aria-pressed", fav ? "true" : "false");
    btn.title = fav ? "Remove from favorites" : "Save to favorites";
  }

  function loadPlace(place, pushRecent) {
    currentPlace = place;
    writeJSON(STORE.lastPlace, place);
    if (pushRecent !== false) saveRecent(place);
    setActiveView("home");
    syncFavoriteButton();
    return WX.load(place);
  }

  /* ---------------------------------------------------------
     Locations view (favorites + recents)
     --------------------------------------------------------- */

  function renderLocationsView() {
    var favList = el("locations-fav-list");
    var recList = el("locations-recent-list");
    var empty = el("locations-empty");
    var favBlock = el("locations-fav-block");
    var recBlock = el("locations-recent-block");

    if (!favorites.length && !recents.length) {
      favBlock.hidden = true;
      recBlock.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    if (favorites.length) {
      favBlock.hidden = false;
      favList.innerHTML = favorites.map(function (f, i) {
        return locRow(f, i, "fav");
      }).join("");
    } else {
      favBlock.hidden = true;
    }

    if (recents.length) {
      recBlock.hidden = false;
      recList.innerHTML = recents.map(function (r, i) {
        return locRow(r, i, "recent");
      }).join("");
    } else {
      recBlock.hidden = true;
    }

    favList.querySelectorAll("[data-action]").forEach(bindLocAction);
    recList.querySelectorAll("[data-action]").forEach(bindLocAction);
  }

  function locRow(p, i, kind) {
    var sub = [p.admin1, p.country].filter(Boolean).join(", ");
    var actions = "";
    if (kind === "fav") {
      actions =
        '<button class="loc-btn up-btn" data-action="up" data-i="' + i + '" aria-label="Move up"></button>' +
        '<button class="loc-btn down-btn" data-action="down" data-i="' + i + '" aria-label="Move down"></button>' +
        '<button class="loc-btn remove-btn" data-action="remove" data-i="' + i + '" aria-label="Remove favorite"></button>';
    } else {
      actions =
        '<button class="loc-btn remove-btn" data-action="remove-recent" data-i="' + i + '" aria-label="Remove from recents"></button>';
    }
    return '<div class="loc-row">' +
      '<button class="loc-main" data-action="load" data-i="' + i + '" data-kind="' + kind + '">' +
      '<span class="loc-name">' + esc(p.name) + '</span>' +
      (sub ? '<span class="loc-sub">' + esc(sub) + "</span>" : "") +
      "</button>" +
      '<div class="loc-actions">' + actions + "</div></div>";
  }

  function bindLocAction(btn) {
    btn.addEventListener("click", function () {
      var kind = btn.dataset.kind || (btn.dataset.action === "remove-recent" ? "recent" : "fav");
      var i = parseInt(btn.dataset.i, 10);
      var list = kind === "recent" ? recents : favorites;
      var place = list[i];
      if (!place) return;
      switch (btn.dataset.action) {
        case "load":
          closeLocations();
          loadPlace(place, kind === "recent" ? true : true);
          break;
        case "remove":
          favorites.splice(i, 1);
          writeJSON(STORE.favorites, favorites);
          syncFavoriteButton();
          renderLocationsView();
          break;
        case "remove-recent":
          recents.splice(i, 1);
          writeJSON(STORE.recents, recents);
          renderLocationsView();
          break;
        case "up":
          if (i > 0) {
            favorites.splice(i - 1, 0, favorites.splice(i, 1)[0]);
            writeJSON(STORE.favorites, favorites);
            renderLocationsView();
          }
          break;
        case "down":
          if (i < favorites.length - 1) {
            favorites.splice(i + 1, 0, favorites.splice(i, 1)[0]);
            writeJSON(STORE.favorites, favorites);
            renderLocationsView();
          }
          break;
      }
    });
  }

  /* ---------------------------------------------------------
     Overlays: drawer, modal, locations view
     --------------------------------------------------------- */

  var backdrop = el("drawer-backdrop");

  function openDrawer() {
    el("settings-drawer").hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(function () {
      el("settings-drawer").classList.add("open");
      backdrop.classList.add("show");
    });
  }

  function closeDrawer() {
    var d = el("settings-drawer");
    d.classList.remove("open");
    backdrop.classList.remove("show");
    setTimeout(function () { d.hidden = true; backdrop.hidden = true; }, 320);
  }

  function openModal() {
    el("day-modal").hidden = false;
    el("modal-backdrop").hidden = false;
    requestAnimationFrame(function () {
      el("day-modal").classList.add("show");
      el("modal-backdrop").classList.add("show");
    });
  }

  function closeModal() {
    el("day-modal").classList.remove("show");
    el("modal-backdrop").classList.remove("show");
    setTimeout(function () {
      el("day-modal").hidden = true;
      el("modal-backdrop").hidden = true;
    }, 300);
  }

  function openLocations(title) {
    renderLocationsView();
    el("locations-view").hidden = false;
    if (title) el("lv-title").textContent = title;
    setActiveView("locations");
  }

  function closeLocations() {
    el("locations-view").hidden = true;
    setActiveView("home");
  }

  function anyOverlayOpen() {
    return !el("settings-drawer").hidden || !el("day-modal").hidden || !el("locations-view").hidden;
  }

  function closeAllOverlays() {
    closeDrawer();
    closeModal();
    closeLocations();
  }

  /* ---------------------------------------------------------
     Navigation
     --------------------------------------------------------- */

  function setActiveView(name) {
    activeView = name;
    document.querySelectorAll("[data-nav]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.nav === name);
    });
    if (name === "locations") {
      openLocationsSilent();
    }
  }

  function openLocationsSilent() {
    if (el("locations-view").hidden) {
      renderLocationsView();
      el("locations-view").hidden = false;
    }
  }

  function handleNav(name) {
    switch (name) {
      case "home":
        closeLocations();
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "locations":
        openLocations("Locations");
        break;
      case "favorites":
        openLocations("Favorites");
        if (!favorites.length) toast("No favorites yet — tap the star to save the current location.");
        break;
      case "settings":
        openDrawer();
        break;
    }
  }

  /* ---------------------------------------------------------
     Search
     --------------------------------------------------------- */

  var searchInput = el("search-input");
  var suggestions = el("search-suggestions");
  var debounceTimer = null;
  var activeSuggestion = -1;
  var lastResults = [];
  var lastGeocodeAt = 0;

  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    var q = searchInput.value.trim();
    if (q.length < 2) { hideSuggestions(); return; }
    debounceTimer = setTimeout(function () { geocode(q); }, 350); // debounced; no request per keystroke
  });

  searchInput.addEventListener("focus", function () {
    if (searchInput.value.trim().length >= 2 && lastResults.length) showSuggestions();
  });

  function geocode(q) {
    var now = Date.now();
    if (now - lastGeocodeAt < 250) return; // extra throttle
    lastGeocodeAt = now;
    fetch("/api/geocode/?q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (body.error) throw new Error(body.error);
        lastResults = body.results || [];
        renderSuggestions();
      })
      .catch(function (err) {
        lastResults = [];
        renderSuggestions(err.message || "Search is unavailable right now.");
      });
  }

  function renderSuggestions(errorMsg) {
    if (errorMsg) {
      suggestions.innerHTML = '<div class="suggestion" role="option" aria-disabled="true">' +
        '<span class="s-sub">' + esc(errorMsg) + "</span></div>";
      suggestions.hidden = false;
      searchInput.setAttribute("aria-expanded", "true");
      return;
    }
    if (!lastResults.length) {
      suggestions.innerHTML = '<div class="suggestion" role="option" aria-disabled="true">' +
        '<span class="s-sub">No matching locations found.</span></div>';
      suggestions.hidden = false;
      searchInput.setAttribute("aria-expanded", "true");
      return;
    }
    activeSuggestion = -1;
    suggestions.innerHTML = lastResults.map(function (r, i) {
      var sub = [r.admin1, r.country].filter(Boolean).join(", ");
      return '<button type="button" class="suggestion" role="option" id="sugg-' + i + '" data-i="' + i + '">' +
        '<span class="s-name">📍 ' + esc(r.name) + "</span>" +
        (sub ? '<span class="s-sub">' + esc(sub) + "</span>" : "") +
        "</button>";
    }).join("");
    suggestions.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    suggestions.querySelectorAll("[data-i]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pickSuggestion(lastResults[parseInt(btn.dataset.i, 10)]);
      });
    });
  }

  function pickSuggestion(r) {
    if (!r) return;
    hideSuggestions();
    searchInput.value = r.name + (r.country ? ", " + r.country : "");
    searchInput.blur();
    loadPlace({
      name: r.name, admin1: r.admin1, country: r.country,
      lat: r.lat, lon: r.lon
    });
  }

  function hideSuggestions() {
    suggestions.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    activeSuggestion = -1;
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".search")) hideSuggestions();
  });

  searchInput.addEventListener("keydown", function (e) {
    var items = suggestions.querySelectorAll("[data-i]");
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      activeSuggestion = (activeSuggestion + 1) % items.length;
      highlightSuggestion(items);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      activeSuggestion = (activeSuggestion - 1 + items.length) % items.length;
      highlightSuggestion(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestion >= 0 && items[activeSuggestion]) {
        pickSuggestion(lastResults[parseInt(items[activeSuggestion].dataset.i, 10)]);
      } else if (lastResults.length) {
        pickSuggestion(lastResults[0]);
      } else {
        var q = searchInput.value.trim();
        if (q.length >= 2) loadPlace({ name: q, query: q });
      }
    } else if (e.key === "Escape") {
      hideSuggestions();
      searchInput.blur();
    }
  });

  function highlightSuggestion(items) {
    items.forEach(function (it, i) { it.classList.toggle("active", i === activeSuggestion); });
    if (items[activeSuggestion]) {
      items[activeSuggestion].scrollIntoView({ block: "nearest" });
      searchInput.setAttribute("aria-activedescendant", items[activeSuggestion].id);
    }
  }

  /* ---------------------------------------------------------
     Geolocation
     --------------------------------------------------------- */

  var geoAsked = false;

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast("Geolocation is not supported by this browser. Please search for a city.");
      return;
    }
    if (geoAsked) toast("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        geoAsked = true;
        fetch("/api/reverse/?lat=" + pos.coords.latitude + "&lon=" + pos.coords.longitude)
          .then(function (r) { return r.json(); })
          .then(function (body) {
            var place = body.place || {
              name: "My Location", admin1: "", country: "",
              lat: pos.coords.latitude, lon: pos.coords.longitude
            };
            place.lat = pos.coords.latitude;
            place.lon = pos.coords.longitude;
            loadPlace(place);
          })
          .catch(function () {
            loadPlace({ name: "My Location", lat: pos.coords.latitude, lon: pos.coords.longitude });
          });
      },
      function (err) {
        geoAsked = true;
        if (err.code === err.PERMISSION_DENIED) {
          toast("Location permission denied. Search for a city instead.");
        } else {
          toast("Could not determine your location. Please search manually.");
        }
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }

  /* ---------------------------------------------------------
     Settings UI
     --------------------------------------------------------- */

  function bindSegGroup(groupId, attr, key, onChange) {
    var group = el(groupId);
    group.querySelectorAll(".seg").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings[key] = btn.dataset[attr];
        writeJSON(STORE.settings, settings);
        syncSettingsUI();
        onChange && onChange();
      });
    });
  }

  function syncSettingsUI() {
    document.querySelectorAll("#theme-group .seg").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.themeOpt === settings.theme ? "true" : "false");
    });
    document.querySelectorAll("#temp-group .seg").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.tempOpt === settings.temp ? "true" : "false");
    });
    document.querySelectorAll("#wind-group .seg").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.windOpt === settings.wind ? "true" : "false");
    });
    document.querySelectorAll("#pressure-group .seg").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.pressureOpt === settings.pressure ? "true" : "false");
    });
    document.querySelectorAll("#vis-group .seg").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.visOpt === settings.vis ? "true" : "false");
    });
  }

  function rerender() {
    if (WX.state.data) WX.load(currentPlace || WX.state.place, { silent: true });
  }

  /* ---------------------------------------------------------
     "Updated X ago" label
     --------------------------------------------------------- */

  setInterval(updateUpdatedLabel, 30000);
  function updateUpdatedLabel() {
    if (!WX.state.fetchedAt) return;
    var mins = Math.max(0, Math.round((Date.now() - WX.state.fetchedAt.getTime()) / 60000));
    var text = mins === 0 ? "Updated just now" :
      mins === 1 ? "Updated 1 minute ago" : "Updated " + mins + " minutes ago";
    el("updated-line").textContent = text;
    el("updated-label").textContent = text;
  }

  /* ---------------------------------------------------------
     Utilities
     --------------------------------------------------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------------------------------------------------
     Service worker (PWA)
     --------------------------------------------------------- */

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/static/sw.js").catch(function () { /* offline support unavailable */ });
    });
  }

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */

  function init() {
    var saved = readJSON(STORE.settings, null);
    if (saved) Object.keys(settings).forEach(function (k) {
      if (saved[k]) settings[k] = saved[k];
    });
    favorites = readJSON(STORE.favorites, []);
    recents = readJSON(STORE.recents, []);

    applyTheme();
    syncSettingsUI();

    bindSegGroup("theme-group", "themeOpt", "theme", applyTheme);
    bindSegGroup("temp-group", "tempOpt", "temp", rerender);
    bindSegGroup("wind-group", "windOpt", "wind", rerender);
    bindSegGroup("pressure-group", "pressureOpt", "pressure", rerender);
    bindSegGroup("vis-group", "visOpt", "vis", rerender);

    // Buttons
    el("locate-btn").addEventListener("click", useMyLocation);
    el("refresh-btn").addEventListener("click", function () {
      if (currentPlace) {
        WX.load(currentPlace, { fresh: true, silent: true });
        toast("Refreshing weather…");
      }
    });
    el("fav-toggle").addEventListener("click", toggleFavorite);
    el("error-retry").addEventListener("click", function () {
      if (currentPlace) loadPlace(currentPlace, false);
      else loadPlace({ name: "Pune", country: "India", lat: 18.5214, lon: 73.8545 });
    });

    el("settings-btn").addEventListener("click", openDrawer);
    el("theme-btn").addEventListener("click", function () {
      var order = ["light", "dark", "system"];
      settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
      writeJSON(STORE.settings, settings);
      applyTheme();
      syncSettingsUI();
      toast("Theme: " + settings.theme);
    });
    el("settings-close").addEventListener("click", closeDrawer);
    el("day-modal-close").addEventListener("click", closeModal);
    el("modal-backdrop").addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeDrawer);
    el("locations-close").addEventListener("click", closeLocations);
    el("clear-recents").addEventListener("click", function () {
      recents = [];
      writeJSON(STORE.recents, recents);
      renderLocationsView();
      toast("Search history cleared.");
    });

    document.querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { handleNav(btn.dataset.nav); });
    });

    el("menu-btn").addEventListener("click", function () {
      el("sidebar").classList.toggle("open");
      el("menu-btn").setAttribute("aria-expanded", el("sidebar").classList.contains("open") ? "true" : "false");
    });

    document.addEventListener("click", function (e) {
      var sidebar = el("sidebar");
      if (sidebar.classList.contains("open") && !e.target.closest("#sidebar") && !e.target.closest("#menu-btn")) {
        sidebar.classList.remove("open");
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !e.target.closest("input, textarea")) {
        e.preventDefault();
        searchInput.focus();
      } else if (e.key === "Escape" && anyOverlayOpen()) {
        closeAllOverlays();
      }
    });

    // Close sidebar when navigating via search (mobile)
    searchInput.addEventListener("focus", function () {
      el("sidebar").classList.remove("open");
    });

    // Initial load: last place → first favorite → default city
    var last = readJSON(STORE.lastPlace, null);
    var initial = last || favorites[0] || { name: "Pune", country: "India", admin1: "Maharashtra", lat: 18.5214, lon: 73.8545 };
    loadPlace(initial, false);

    // Refresh stale data when the tab becomes visible again
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && WX.state.fetchedAt &&
          Date.now() - WX.state.fetchedAt.getTime() > 10 * 60 * 1000) {
        WX.load(currentPlace, { silent: true });
      }
    });

    updateUpdatedLabel();
  }

  window.App = {
    settings: settings,
    toast: toast,
    isLightTheme: isLightTheme,
    showSkeleton: showSkeleton,
    hideSkeleton: hideSkeleton,
    showError: showError,
    openModal: openModal,
    onWeatherLoaded: function () {
      updateUpdatedLabel();
      syncFavoriteButton();
    }
  };

  window.addEventListener("DOMContentLoaded", init);
})();
