/* ============================================================
   AtmosWeather — weather.js
   Fetching, formatting, and rendering all weather data.
   Exposes window.WX = { load, state, formatters }.
   ============================================================ */

(function () {
  "use strict";

  var state = {
    data: null,
    place: null,
    fetchedAt: null,
    loading: false
  };

  var refreshTimer = null;
  var REFRESH_MS = 10 * 60 * 1000; // 10 minutes; server caches for the same window

  /* ---------------------------------------------------------
     Unit formatting (settings come from window.App.settings)
     --------------------------------------------------------- */

  function settings() {
    return (window.App && window.App.settings) || {
      temp: "c", wind: "kmh", pressure: "hpa", vis: "km"
    };
  }

  function cToF(v) { return v * 9 / 5 + 32; }

  function fmtTemp(v, withUnit) {
    if (v === null || v === undefined) return "—";
    var val = settings().temp === "f" ? cToF(v) : v;
    var s = String(Math.round(val));
    return withUnit ? s + "°" + (settings().temp === "f" ? "F" : "C") : s + "°";
  }

  function fmtTempRaw(v) {
    if (v === null || v === undefined) return "—";
    return String(Math.round(settings().temp === "f" ? cToF(v) : v));
  }

  function fmtWind(kmh) {
    if (kmh === null || kmh === undefined) return "—";
    var s = settings().wind, val;
    if (s === "mph") return Math.round(kmh * 0.621371) + " mph";
    if (s === "ms") return (kmh / 3.6).toFixed(1).replace(/\.0$/, "") + " m/s";
    val = Math.round(kmh);
    return val + " km/h";
  }

  function fmtPressure(hpa) {
    if (hpa === null || hpa === undefined) return "—";
    if (settings().pressure === "inhg") return (hpa * 0.02953).toFixed(2) + " inHg";
    return Math.round(hpa) + " hPa";
  }

  function fmtVis(meters) {
    if (meters === null || meters === undefined) return "—";
    if (settings().vis === "mi") {
      var mi = meters / 1609.344;
      return (mi >= 10 ? Math.round(mi) : mi.toFixed(1)) + " mi";
    }
    var km = meters / 1000;
    return (km >= 10 ? Math.round(km) : km.toFixed(1)) + " km";
  }

  function fmtPrecip(mm) {
    if (mm === null || mm === undefined) return "—";
    return (Math.round(mm * 10) / 10) + " mm";
  }

  function fmtTime12(iso) {
    if (!iso) return "—";
    var m = /T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return iso;
    var h = parseInt(m[1], 10), min = m[2];
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 || 12;
    return h12 + ":" + min + " " + ampm;
  }

  function fmtHourLabel(iso, isNow) {
    if (isNow) return "Now";
    var m = /T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return iso;
    var h = parseInt(m[1], 10);
    if (m[2] !== "00") return fmtTime12(iso);
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 || 12;
    return h12 + " " + ampm;
  }

  function fmtDayName(dateStr) {
    var d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }

  function fmtDayShort(dateStr) {
    var d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }

  function fmtDateLine(dateStr) {
    var d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function fmtDaylight(seconds) {
    if (!seconds) return "—";
    var h = Math.floor(seconds / 3600);
    var m = Math.round((seconds % 3600) / 60);
    return h + "h " + m + "m of daylight";
  }

  function placeLabel(place) {
    if (!place) return "—";
    var parts = [place.name];
    if (place.country) parts.push(place.country);
    return parts.join(", ");
  }

  function placeSub(place) {
    if (!place) return "";
    var parts = [];
    if (place.admin1 && place.admin1 !== place.name) parts.push(place.admin1);
    if (place.country && parts[0] !== place.country) parts.push(place.country);
    return parts.join(", ");
  }

  /* ---------------------------------------------------------
     Data loading
     --------------------------------------------------------- */

  function buildQuery(place, fresh) {
    var p = new URLSearchParams();
    if (place.lat !== undefined && place.lat !== null && !place.query) {
      p.set("lat", place.lat);
      p.set("lon", place.lon);
      if (place.name) p.set("name", place.name);
      if (place.admin1) p.set("admin1", place.admin1);
      if (place.country) p.set("country", place.country);
    } else {
      p.set("q", place.query || place.name);
    }
    if (fresh) p.set("fresh", "1");
    return p.toString();
  }

  function doFetch(place, opts) {
    var qs = buildQuery(place, opts.fresh);
    // Bypass HTTP cache on manual refresh
    return fetch("/api/weather/?" + qs, { cache: opts.fresh ? "no-store" : "default" })
      .then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.error || "Weather data is temporarily unavailable. Please try again.");
          return body;
        });
      });
  }

  function load(place, opts) {
    opts = opts || {};
    if (state.loading) return Promise.resolve();
    state.loading = true;

    var hasData = !!state.data;
    var contentEl = document.getElementById("content");
    if (!opts.silent) {
      if (hasData) {
        // City switch: keep the previous view visible, just dim it slightly.
        contentEl && contentEl.classList.add("updating");
      } else {
        window.App && window.App.showSkeleton();
      }
    }

    // One automatic retry protects against transient network blips.
    return doFetch(place, opts)
      .catch(function (firstErr) {
        return new Promise(function (resolve) { setTimeout(resolve, 1500); })
          .then(function () { return doFetch(place, opts); })
          .catch(function () { throw firstErr; });
      })
      .then(function (data) {
        state.data = data;
        state.place = data.place;
        state.fetchedAt = new Date();
        render();
        window.App && window.App.onWeatherLoaded(data);
        scheduleRefresh();
      })
      .catch(function (err) {
        if (state.data) {
          window.App && window.App.toast(err.message || "Could not refresh weather data.");
        } else {
          window.App && window.App.showError(err.message || "Weather data is temporarily unavailable. Please try again.");
        }
      })
      .then(function () {
        state.loading = false;
        contentEl && contentEl.classList.remove("updating");
        window.App && window.App.hideSkeleton();
      });
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (!document.hidden && state.place) {
        load(state.place, { silent: true });
      }
    }, REFRESH_MS);
  }

  /* ---------------------------------------------------------
     Rendering
     --------------------------------------------------------- */

  function el(id) { return document.getElementById(id); }

  function render() {
    var d = state.data;
    if (!d) return;
    renderHero(d);
    renderAlerts(d);
    renderToday(d);
    renderHourly(d);
    renderDaily(d);
    renderSun(d);
    renderAqi(d);
    renderDetails(d);
    initMap(d);
    animateSwap();
  }

  function animateSwap() {
    var hero = document.querySelector(".hero-content");
    var icon = document.getElementById("hero-icon");
    if (hero && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hero.classList.remove("swap-in");
      void hero.offsetWidth;
      hero.classList.add("swap-in");
    }
    if (icon && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      icon.classList.remove("swap-in");
      void icon.offsetWidth;
      icon.classList.add("swap-in");
    }
  }

  function renderHero(d) {
    var cur = d.current;
    el("place-name").textContent = placeLabel(d.place);
    var sub = placeSub(d.place);
    el("place-sub").textContent = sub;
    document.title = placeLabel(d.place) + " — AtmosWeather";

    var offsetMs = (d.utc_offset_seconds || 0) * 1000;
    var local = new Date(Date.now() + offsetMs);
    var dateLine = local.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", timeZone: "UTC"
    });
    var timeLine = local.toLocaleTimeString(undefined, {
      hour: "numeric", minute: "2-digit", timeZone: "UTC"
    });
    el("local-date").textContent = dateLine + " · " + timeLine + " local";

    el("temp-now").textContent = fmtTempRaw(cur.temp);
    el("temp-unit").textContent = "°";
    el("condition").textContent = cur.label || "—";
    el("feels").textContent = "Feels like " + fmtTemp(cur.feels);
    el("summary").textContent = d.summary || "";

    el("hero-icon").innerHTML = window.BG.icon(cur.condition, cur.is_day);

    var chips = [];
    chips.push(chip("drop", "Humidity", (cur.humidity !== null && cur.humidity !== undefined ? cur.humidity + "%" : "—")));
    chips.push(chip("wind", "Wind", fmtWind(cur.wind) + (cur.wind_compass ? " " + cur.wind_compass : "")));
    var uvNow = d.hourly && d.hourly[0] ? d.hourly[0].uv : null;
    chips.push(chip("uv", "UV", uvNow !== null && uvNow !== undefined ? Math.round(uvNow * 10) / 10 : "—"));
    el("hero-chips").innerHTML = chips.join("");

    window.BG.setSceneFromPayload(d, window.App && window.App.isLightTheme ? window.App.isLightTheme() : false);
  }

  function chip(iconName, label, value) {
    return '<span class="chip">' + detailIcon(iconName) + "<span>" + label + " <b>" + value + "</b></span></span>";
  }

  function renderAlerts(d) {
    var card = el("alerts-card");
    var section = el("alerts-section");
    if (d.alerts && d.alerts.length) {
      var html = "";
      d.alerts.forEach(function (a) {
        html += '<div class="alert-item"><p class="alert-title">⚠ ' + escapeHtml(a.title) + "</p>" +
          '<p class="alert-desc">' + escapeHtml(a.description || "") + "</p></div>";
      });
      card.innerHTML = html;
      card.classList.remove("all-clear");
      section.hidden = false;
    } else {
      card.innerHTML = '<p class="alert-title">No active weather alerts.</p>' +
        '<p class="alert-desc">Conditions are quiet for this area right now.</p>';
      card.classList.add("all-clear");
      section.hidden = false;
    }
  }

  function renderToday(d) {
    var cur = d.current;
    var today = d.daily && d.daily[0];
    var cells = [];
    if (today) {
      cells.push(cell("High / Low", fmtTemp(today.max) + " / " + fmtTemp(today.min), "Today's range"));
      cells.push(cell("Rain chance", (today.pop !== null && today.pop !== undefined ? today.pop + "%" : "—"), fmtPrecip(today.precip) + " expected"));
    }
    cells.push(cell("Humidity", cur.humidity !== null && cur.humidity !== undefined ? cur.humidity + "%" : "—", "Relative humidity"));
    cells.push(cell("Wind", fmtWind(cur.wind) + (cur.wind_compass ? " " + cur.wind_compass : ""),
      cur.gusts !== null && cur.gusts !== undefined ? "Gusts " + fmtWind(cur.gusts) : ""));
    if (today) {
      cells.push(cell("UV index", today.uv_max !== null && today.uv_max !== undefined ? Math.round(today.uv_max * 10) / 10 : "—", today.uv_max_label || ""));
      cells.push(cell("Sunrise", fmtTime12(today.sunrise), "Sunset " + fmtTime12(today.sunset)));
    }
    cells.push(cell("Cloud cover", cur.cloud !== null && cur.cloud !== undefined ? cur.cloud + "%" : "—", "Sky coverage"));
    if (d.moon) {
      cells.push(cell("Moon", d.moon.phase, d.moon.illumination + "% illuminated"));
    }
    el("today-grid").innerHTML = cells.join("");
  }

  function cell(label, value, sub) {
    return '<div class="today-cell"><span class="tc-label">' + label + "</span>" +
      '<span class="tc-value">' + value + "</span>" +
      (sub ? '<span class="tc-sub">' + sub + "</span>" : "") + "</div>";
  }

  /* ---------------- Hourly + temperature graph ---------------- */

  function renderHourly(d) {
    var hours = d.hourly || [];
    var scroll = el("hourly-scroll");
    var items = hours.map(function (h, i) {
      var pop = h.pop !== null && h.pop !== undefined ? h.pop : 0;
      return '<div class="hour' + (i === 0 ? " now" : "") + '" role="listitem">' +
        '<span class="h-time">' + fmtHourLabel(h.time, i === 0) + "</span>" +
        '<span class="h-icon">' + window.BG.icon(h.condition, h.is_day) + "</span>" +
        '<span class="h-temp">' + fmtTemp(h.temp) + "</span>" +
        '<span class="h-pop' + (pop >= 30 ? " wet" : "") + '">' + (pop > 0 ? pop + "%" : "") + "</span>" +
        "</div>";
    });
    scroll.innerHTML = items.join("");
    scroll.scrollLeft = 0;
    drawTempGraph(hours);
  }

  function drawTempGraph(hours) {
    var svg = el("temp-graph");
    if (!hours.length) { svg.innerHTML = ""; return; }
    var W = 720, H = 170, PADX = 34, PADTOP = 40, PADBOT = 34;
    var temps = hours.map(function (h) { return h.temp; });
    var min = Math.min.apply(null, temps), max = Math.max.apply(null, temps);
    if (max - min < 2) { max += 1; min -= 1; }

    function px(i) { return PADX + (i * (W - PADX * 2)) / (hours.length - 1); }
    function py(v) { return PADTOP + (1 - (v - min) / (max - min)) * (H - PADTOP - PADBOT); }

    var pts = temps.map(function (v, i) { return [px(i), py(v)]; });

    // Smooth Catmull-Rom -> bezier path
    var path = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
    }
    var area = path + " L" + pts[pts.length - 1][0].toFixed(1) + "," + (H - 4) + " L" + pts[0][0].toFixed(1) + "," + (H - 4) + " Z";

    var minIdx = temps.indexOf(min), maxIdx = temps.indexOf(max);

    var html = "<defs><linearGradient id='tg-fill' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0%' stop-color='currentColor' stop-opacity='0.32'/>" +
      "<stop offset='100%' stop-color='currentColor' stop-opacity='0.02'/>" +
      "</linearGradient></defs>";

    // X axis hour ticks every 6h
    for (i = 0; i < hours.length; i += 6) {
      html += "<text x='" + px(i).toFixed(1) + "' y='" + (H - 10) + "' text-anchor='middle' class='tg-tick'>" +
        fmtHourLabel(hours[i].time, i === 0) + "</text>";
    }

    html += "<path d='" + area + "' fill='url(#tg-fill)'/>";
    html += "<path d='" + path + "' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' class='tg-line'/>";

    // Min / max / now markers
    html += marker(pts[minIdx], "Min", fmtTemp(min), true);
    html += marker(pts[maxIdx], "Max", fmtTemp(max), false);
    html += "<circle cx='" + pts[0][0].toFixed(1) + "' cy='" + pts[0][1].toFixed(1) + "' r='5' class='tg-now-dot'/>";
    html += "<text x='" + (pts[0][0] + 10).toFixed(1) + "' y='" + (pts[0][1] - 12).toFixed(1) + "' class='tg-label tg-now'>Now " + fmtTemp(temps[0]) + "</text>";

    svg.innerHTML = html;
  }

  function marker(pt, name, val, below) {
    var dy = below ? 24 : -14;
    return "<circle cx='" + pt[0].toFixed(1) + "' cy='" + pt[1].toFixed(1) + "' r='3.5' class='tg-dot'/>" +
      "<text x='" + pt[0].toFixed(1) + "' y='" + (pt[1] + dy).toFixed(1) + "' text-anchor='middle' class='tg-label'>" +
      val + "</text>";
  }

  /* ---------------- 5-day forecast ---------------- */

  function renderDaily(d) {
    var grid = el("daily-grid");
    var days = (d.daily || []).slice(0, 5);
    grid.innerHTML = days.map(function (day, i) {
      var pop = day.pop !== null && day.pop !== undefined ? day.pop : 0;
      return '<button type="button" class="day-card" role="listitem" data-day="' + i + '" ' +
        'aria-label="' + fmtDayName(day.date) + ": " + day.label + ", " + fmtTemp(day.max) + " / " + fmtTemp(day.min) + '. View details">' +
        '<div class="d-name">' + (i === 0 ? "Today" : fmtDayShort(day.date)) + "</div>" +
        '<div class="d-date">' + fmtDateLine(day.date) + "</div>" +
        '<div class="d-icon">' + window.BG.icon(day.condition, true) + "</div>" +
        '<div class="d-cond">' + day.label + "</div>" +
        '<div class="d-temps">' + fmtTemp(day.max) + ' <span class="lo">/ ' + fmtTemp(day.min) + "</span></div>" +
        '<div class="d-pop' + (pop >= 30 ? " wet" : "") + '">' + (pop > 0 ? "💧 " + pop + "% rain" : "&nbsp;") + "</div>" +
        "</button>";
    }).join("");

    grid.querySelectorAll(".day-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openDayModal(parseInt(btn.dataset.day, 10));
      });
    });
  }

  function openDayModal(i) {
    var d = state.data;
    var day = d.daily && d.daily[i];
    if (!day) return;
    var body = el("day-modal-body");
    var cells = [
      dmCell("High / Low", fmtTemp(day.max) + " / " + fmtTemp(day.min)),
      dmCell("Feels like", fmtTemp(day.feels_min) + " – " + fmtTemp(day.feels_max)),
      dmCell("Rain chance", day.pop !== null && day.pop !== undefined ? day.pop + "%" : "—"),
      dmCell("Precipitation", fmtPrecip(day.precip)),
      dmCell("Wind", fmtWind(day.wind_max) + (day.wind_dir !== null && day.wind_dir !== undefined ? " " + compassOf(day.wind_dir) : "")),
      dmCell("Gusts", day.gust_max !== null && day.gust_max !== undefined ? fmtWind(day.gust_max) : "—"),
      dmCell("UV index", day.uv_max !== null && day.uv_max !== undefined ? Math.round(day.uv_max * 10) / 10 : "—", day.uv_max_label || ""),
      dmCell("Sunrise / Sunset", fmtTime12(day.sunrise) + " / " + fmtTime12(day.sunset)),
      dmCell("Daylight", fmtDaylight(day.daylight))
    ];
    body.innerHTML =
      '<div class="dm-head"><h3 class="dm-day">' + (i === 0 ? "Today" : fmtDayName(day.date)) + "</h3>" +
      '<div class="dm-date">' + fmtDateLine(day.date) + "</div></div>" +
      '<div class="dm-icon">' + window.BG.icon(day.condition, true) + "</div>" +
      '<div class="dm-cond">' + day.label + "</div>" +
      '<div class="dm-temps">' + fmtTemp(day.max) + ' <span class="lo">/ ' + fmtTemp(day.min) + "</span></div>" +
      '<div class="dm-grid">' + cells.join("") + "</div>";
    window.App && window.App.openModal();
  }

  function dmCell(label, value, sub) {
    return '<div class="dm-cell"><span class="tc-label">' + label + "</span>" +
      '<span class="tc-value">' + value + "</span>" +
      (sub ? '<span class="tc-sub">' + sub + "</span>" : "") + "</div>";
  }

  function compassOf(deg) {
    var pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return pts[Math.round((deg % 360) / 22.5) % 16];
  }

  /* ---------------- Sun & moon ---------------- */

  function renderSun(d) {
    var sun = d.sun || {};
    el("sunrise-time").textContent = fmtTime12(sun.sunrise);
    el("sunset-time").textContent = fmtTime12(sun.sunset);
    el("daylight-len").textContent = fmtDaylight(sun.daylight);

    var svg = el("sun-arc");
    var W = 320, H = 150;
    var x1 = 46, x2 = W - 46;          // horizon endpoints
    var baseY = 128;                    // horizon line
    var peak = 46;                      // orbit apex height above horizon (apex y = 82)

    var html = "";

    // "Night"/"Day" label pinned at the very top of the graph area.
    // Orbit apex sits at y≈82, so there is always a wide clear band (~50px)
    // between the label baseline and the topmost point of the dotted curve.
    var offsetMs = (d.utc_offset_seconds || 0) * 1000;
    var nowD = new Date(Date.now() + offsetMs);
    var nowMin = nowD.getUTCHours() * 60 + nowD.getUTCMinutes();
    var riseMin = timeToMinutes(sun.sunrise), setMin = timeToMinutes(sun.sunset);
    var isDaytime = riseMin !== null && setMin !== null && setMin > riseMin &&
      nowMin >= riseMin && nowMin <= setMin;

    html += "<text x='" + (W / 2) + "' y='15' text-anchor='middle' class='sa-top-label'>" +
      (isDaytime ? "Day" : "Night") + "</text>";

    // Quadratic orbit: M x1,baseY  Q mid,(baseY - 2*peak)  x2,baseY
    var midX = (x1 + x2) / 2, ctrlY = baseY - 2 * peak;
    var orbit = "M" + x1 + " " + baseY + " Q " + midX + " " + ctrlY + " " + x2 + " " + baseY;

    // Traveled portion of the orbit (accent color)
    var t = 0;
    if (riseMin !== null && setMin !== null && setMin > riseMin) {
      t = Math.min(1, Math.max(0, (nowMin - riseMin) / (setMin - riseMin)));
    }
    if (isDaytime && t > 0.005 && t < 0.995) {
      // De Casteljau split of the quadratic at t gives the traveled sub-curve
      var ax = x1 + (midX - x1) * t, ay = baseY + (ctrlY - baseY) * t;
      var bx2 = midX + (x2 - midX) * t, by2 = ctrlY + (baseY - ctrlY) * t;
      var px2 = ax + (bx2 - ax) * t, py2 = ay + (by2 - ay) * t;
      html += "<path d='M" + x1 + " " + baseY + " Q " + ax.toFixed(1) + " " + ay.toFixed(1) + " " + px2.toFixed(1) + " " + py2.toFixed(1) +
        "' class='sa-traveled'/>";
    }

    // Dotted orbit on top
    html += "<path d='" + orbit + "' class='sa-orbit'/>";

    // Horizon
    html += "<line x1='" + (x1 - 14) + "' y1='" + baseY + "' x2='" + (x2 + 14) + "' y2='" + baseY + "' class='sa-horizon'/>";

    // Celestial marker riding the orbit (smooth CSS transition on transform).
    // Sunrise/sunset times live in the HTML row BELOW the svg, so the marker
    // can never overlap them. t is clamped so the circle stays fully inside
    // the graph area for any sunrise/sunset/current-time combination.
    var markerT = isDaytime ? t : (riseMin !== null && setMin !== null && setMin > riseMin ? (nowMin < riseMin ? 0 : 1) : 0.5);
    markerT = Math.min(0.96, Math.max(0.04, markerT));
    var mx = (1 - markerT) * (1 - markerT) * x1 + 2 * (1 - markerT) * markerT * midX + markerT * markerT * x2;
    var my = (1 - markerT) * (1 - markerT) * baseY + 2 * (1 - markerT) * markerT * ctrlY + markerT * markerT * baseY;
    var night = !isDaytime;

    html += "<g class='sa-marker' transform='translate(" + mx.toFixed(1) + "," + my.toFixed(1) + ")'>" +
      "<circle r='12' class='" + (night ? "sa-moon-glow" : "sa-sun-glow") + "'/>" +
      "<circle r='6.5' class='" + (night ? "sa-moon-core" : "sa-sun-core") + "'/>" +
      "</g>";

    svg.innerHTML = html;

    if (d.moon) {
      var glyph = moonGlyph(d.moon.phase);
      el("moon-row").innerHTML =
        '<span class="mr-icon" aria-hidden="true">' + glyph + "</span>" +
        "<span>" + d.moon.phase + " · " + d.moon.illumination + "% illuminated</span>";
    } else {
      el("moon-row").innerHTML = "";
    }
  }

  function moonGlyph(phase) {
    if (/Full/.test(phase)) return "🌕";
    if (/Waxing Gibbous/.test(phase)) return "🌖";
    if (/First/.test(phase)) return "🌗";
    if (/Waxing Crescent/.test(phase)) return "🌘";
    if (/New/.test(phase)) return "🌑";
    if (/Waning Crescent/.test(phase)) return "🌒";
    if (/Last/.test(phase)) return "🌓";
    if (/Waning Gibbous/.test(phase)) return "🌔";
    return "🌙";
  }

  function timeToMinutes(iso) {
    if (!iso) return null;
    var m = /T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /* ---------------- Air quality ---------------- */

  function renderAqi(d) {
    var section = el("aqi-section");
    var air = d.air_quality;
    if (!air || air.aqi === null || air.aqi === undefined) {
      section.hidden = true; // gracefully hide when unavailable
      return;
    }
    section.hidden = false;
    var aqi = Math.round(air.aqi);
    var pct = Math.min(100, (aqi / 300) * 100);
    var polls = [
      ["PM2.5", air.pm2_5], ["PM10", air.pm10], ["O₃", air.o3],
      ["NO₂", air.no2], ["SO₂", air.so2], ["CO", air.co]
    ].filter(function (p) { return p[1] !== null && p[1] !== undefined; });

    el("aqi-card").innerHTML =
      '<div class="aqi-top"><span class="aqi-value">' + aqi + '</span>' +
      '<span class="aqi-badge ' + (air.css_class || "aqi-good") + '">' + (air.category || "Air Quality") + "</span></div>" +
      '<div class="aqi-bar"><div class="aqi-dot" style="left:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="aqi-polls">' + polls.map(function (p) {
        return '<div class="aqi-poll"><span class="ap-name">' + p[0] + '</span><span class="ap-val">' +
          (p[1] >= 100 ? Math.round(p[1]) : Math.round(p[1] * 10) / 10) + " µg/m³</span></div>";
      }).join("") + "</div>";
  }

  /* ---------------- Weather details ---------------- */

  var DETAIL_ICONS = {
    humidity: "drop", wind: "wind", pressure: "gauge", visibility: "eye",
    uv: "uv", cloud: "cloud", dew: "dew", precip: "umbrella", gusts: "gust"
  };

  function detailIcon(name) {
    var stroke = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    switch (name) {
      case "drop": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M12 3.5s6 6.6 6 10.7a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5Z"/></svg>';
      case "wind": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg>';
      case "gauge": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M4 14a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/></svg>';
      case "eye": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
      case "uv": return '<svg viewBox="0 0 24 24" ' + stroke + '><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>';
      case "cloud": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10a4 4 0 0 1-1 7.9H7Z"/></svg>';
      case "dew": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M12 3s6 6.6 6 10.7a6 6 0 0 1-12 0C6 9.6 12 3 12 3Z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/></svg>';
      case "umbrella": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z"/><path d="M12 12v6a2 2 0 0 0 4 0"/></svg>';
      case "gust": return '<svg viewBox="0 0 24 24" ' + stroke + '><path d="M4 9h12a3.5 3.5 0 1 0-3.5-3.5"/><path d="M4 14h9a3 3 0 1 1-3 3"/></svg>';
      default: return '<svg viewBox="0 0 24 24" ' + stroke + '><circle cx="12" cy="12" r="8"/></svg>';
    }
  }

  function renderDetails(d) {
    var cur = d.current;
    var hourly0 = d.hourly && d.hourly[0] ? d.hourly[0] : {};
    var vis = hourly0.vis !== undefined ? hourly0.vis : null;
    var dew = hourly0.dew !== undefined ? hourly0.dew : null;
    var uv = hourly0.uv !== undefined ? hourly0.uv : null;

    function uvLabel(v) {
      if (v === null || v === undefined) return "";
      if (v < 3) return "Low";
      if (v < 6) return "Moderate";
      if (v < 8) return "High";
      if (v < 11) return "Very high";
      return "Extreme";
    }

    function windDirName(deg) {
      if (deg === null || deg === undefined) return "";
      var pts = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
      return "From the " + pts[Math.round((deg % 360) / 45) % 8];
    }

    var cards = [
      ["Humidity", cur.humidity !== null && cur.humidity !== undefined ? cur.humidity + "%" : "—", cur.humidity >= 75 ? "Very humid air" : cur.humidity <= 30 ? "Dry air" : "Comfortable moisture", "humidity"],
      ["Wind", fmtWind(cur.wind) + (cur.wind_compass ? " " + cur.wind_compass : ""), windDirName(cur.wind_dir), "wind"],
      ["Pressure", fmtPressure(cur.pressure), cur.pressure >= 1015 ? "Settled conditions" : cur.pressure <= 1000 ? "Unsettled / low" : "Near average", "pressure"],
      ["Visibility", vis !== null ? fmtVis(vis) : "—", vis !== null ? (vis >= 10000 ? "Crystal clear" : vis >= 4000 ? "Moderate haze" : "Poor visibility") : "", "eye"],
      ["UV Index", uv !== null ? Math.round(uv * 10) / 10 : "—", uvLabel(uv), "uv"],
      ["Cloud Cover", cur.cloud !== null && cur.cloud !== undefined ? cur.cloud + "%" : "—", cur.cloud >= 80 ? "Overcast sky" : cur.cloud <= 20 ? "Mostly open sky" : "Broken clouds", "cloud"],
      ["Dew Point", fmtTemp(dew), dew !== null && cur.temp !== null && dew >= cur.temp - 2 ? "Oppressive humidity" : "Typical for the air", "dew"],
      ["Precipitation", fmtPrecip(cur.precip), (cur.precip || 0) > 0 ? "Falling right now" : "None in the last hour", "umbrella"]
    ];

    el("details-grid").innerHTML = cards.map(function (c) {
      return '<div class="detail-card glass"><div class="detail-icon">' + detailIcon(DETAIL_ICONS[c[3]] || c[3]) + "</div>" +
        '<div class="detail-body"><div class="detail-label">' + c[0] + '</div>' +
        '<div class="detail-value">' + c[1] + "</div>" +
        (c[2] ? '<div class="detail-sub">' + c[2] + "</div>" : "") + "</div></div>";
    }).join("");
  }

  /* ---------------- Weather map (OSM base + RainViewer radar) ---------------- */

  var mapObj = null, mapMarker = null, mapInited = false, mapObserver = null;
  var mapPendingData = null;
  var radarFrames = [], radarLayers = [], radarCurrent = 0;
  var radarMeta = null;

  // Esri ArcGIS Online basemaps — free, no API key required. (OSM's tile
  // server 403-blocks browser apps and CARTO's tiles now demand an API key.)
  // Note Esri tile path is /{z}/{y}/{x}, not /{z}/{x}/{y}.
  var ESRI_LIGHT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  var ESRI_DARK_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  var ESRI_ATTRIB = 'Tiles © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — Esri, DeLorme, NAVTEQ';
  var RADAR_META_URL = "https://api.rainviewer.com/public/weather-maps.json";
  var RADAR_MAX_ZOOM = 7;   // RainViewer tile limit
  var RADAR_OPACITY = 0.65;

  function mapOverlay(show, msg, showRetry, spinner) {
    var ov = el("map-overlay");
    if (!ov) return;
    ov.hidden = !show;
    el("map-overlay-msg").textContent = msg || "";
    el("map-retry").hidden = !showRetry;
    var sp = ov.querySelector(".sk-spinner");
    if (sp) sp.style.display = spinner === false ? "none" : "";
  }

  function initMap(d) {
    var elx = el("map");
    if (!elx) return;
    mapPendingData = d;

    if (typeof window.L === "undefined") {
      setTimeout(function () { initMap(mapPendingData); }, 400);
      return;
    }
    if (!mapInited) {
      if (mapObserver) return;
      // If the container is already on screen, skip the observer entirely —
      // it can miss elements that are visible at observe() time.
      var rect = elx.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200 && rect.bottom > -200 && rect.width > 0) {
        setupMap();
        return;
      }
      mapObserver = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          mapObserver.disconnect();
          mapObserver = null;
          setupMap();
        }
      }, { rootMargin: "200px" });
      mapObserver.observe(elx);
      return;
    }
    updateMapView();
  }

  function setupMap() {
    var d = mapPendingData;
    var elx = el("map");
    if (!d || !elx || mapInited) return;
    mapInited = true;

    var d0 = mapPendingData;
    var lat0 = d0 && d0.place.lat !== undefined ? d0.place.lat : 20;
    var lon0 = d0 && d0.place.lon !== undefined ? d0.place.lon : 0;
    // Create the map already centered — never setView before the first
    // invalidateSize (a pan/zoom animation that gets invalidated mid-flight
    // freezes the pane transform and breaks tile placement).
    mapObj = window.L.map(elx, {
      center: [lat0, lon0],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      minZoom: 2,
      maxZoom: RADAR_MAX_ZOOM,
      worldCopyJump: true
    });
    // Esri basemap tiles — no API key needed; light/dark follows the theme.
    var isLight = window.App && typeof window.App.isLightTheme === "function"
      ? window.App.isLightTheme() : false;
    window.L.tileLayer(isLight ? ESRI_LIGHT_URL : ESRI_DARK_URL, {
      maxZoom: RADAR_MAX_ZOOM,
      attribution: ESRI_ATTRIB
    }).addTo(mapObj);

    var lat = d.place.lat, lon = d.place.lon;
    mapObj.on("click", function () {
      if (mapObj.scrollWheelZoom.enabled()) mapObj.scrollWheelZoom.disable();
      else mapObj.scrollWheelZoom.enable();
    });

    // Bind error-fallback retry (the only remaining radar control)
    el("map-retry").addEventListener("click", function () { loadRadarMeta(true); });

    // Staged invalidation handles late layout/font settling.
    var fixSize = function () { if (mapObj) mapObj.invalidateSize(); };
    [50, 250, 700].forEach(function (ms) { setTimeout(fixSize, ms); });
    mapObj.whenReady(fixSize);
    window.addEventListener("resize", fixSize);

    setTimeout(function () { addMapMarker(); }, 80);
    loadRadarMeta(false);
  }

  function addMapMarker() {
    var d = mapPendingData;
    if (!d || !mapObj) return;
    var lat = d.place.lat, lon = d.place.lon;
    if (lat === undefined || lat === null) return;
    if (mapMarker) mapMarker.remove();
    mapMarker = window.L.circleMarker([lat, lon], {
      radius: 9, color: "#ffffff", weight: 2.5, fillColor: "#2f7fd6", fillOpacity: 0.9
    }).addTo(mapObj);
  }

  function updateMapView() {
    var d = mapPendingData;
    if (!d || !mapObj) return;
    var lat = d.place.lat, lon = d.place.lon;
    if (lat === undefined || lat === null) return;
    mapObj.setView([lat, lon], 5, { animate: false });
    setTimeout(function () { mapObj.invalidateSize(); }, 100);
    addMapMarker();
  }

  /* Fetch current RainViewer metadata, then build radar tile URLs dynamically. */
  function loadRadarMeta(isRetry) {
    if (!mapObj) return;
    radarMeta = null;
    clearRadarLayers();
    mapOverlay(true, isRetry ? "Refreshing weather radar…" : "Loading weather radar…", false, true);
    el("map-updated").textContent = isRetry ? "Refreshing…" : "Loading weather radar…";

    fetch(RADAR_META_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("RainViewer metadata HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.host || !data.radar || !Array.isArray(data.radar.past) || !data.radar.past.length) {
          throw new Error("RainViewer response missing radar frames");
        }
        radarMeta = data;
        // Past frames + nowcast, chronological
        radarFrames = data.radar.past.concat(data.radar.nowcast || []);
        buildRadarLayers(data.host);
        el("map-updated").textContent = "Updated " + radarFrameClock(radarFrames[radarFrames.length - 1].time);
        mapOverlay(false);
        showRadarFrame(radarFrames.length - 1);
      })
      .catch(function (err) {
        console.warn("[AtmosWeather] radar load failed:", err);
        radarFrames = [];
        mapOverlay(true, "Weather radar temporarily unavailable.", true, false);
        el("map-updated").textContent = "Radar unavailable";
      });
  }

  function buildRadarLayers(host) {
    clearRadarLayers();
    radarFrames.forEach(function (frame, i) {
      var url = host + frame.path + "/256/{z}/{x}/{y}/2/1_1.png";
      var layer = window.L.tileLayer(url, {
        opacity: i === radarFrames.length - 1 ? RADAR_OPACITY : 0,
        maxZoom: RADAR_MAX_ZOOM,
        tileSize: 256
      });
      layer.addTo(mapObj);
      radarLayers.push(layer);
    });
  }

  function clearRadarLayers() {
    radarLayers.forEach(function (l) { try { mapObj.removeLayer(l); } catch (e) { /* already gone */ } });
    radarLayers = [];
  }

  function showRadarFrame(i) {
    if (!radarLayers.length || i < 0 || i >= radarLayers.length) return;
    radarCurrent = i;
    radarLayers.forEach(function (l, idx) {
      l.setOpacity(idx === i ? RADAR_OPACITY : 0);
    });
  }

  function radarFrameClock(unixSec) {
    var d = new Date(unixSec * 1000);
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 || 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- Public API ---------------- */

  window.WX = {
    state: state,
    load: load,
    fmtTemp: fmtTemp,
    fmtWind: fmtWind,
    fmtPressure: fmtPressure,
    fmtVis: fmtVis,
    fmtTime12: fmtTime12,
    placeLabel: placeLabel,
    placeSub: placeSub,
    detailIcon: detailIcon
  };
})();
