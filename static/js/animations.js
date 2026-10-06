/* ============================================================
   AtmosWeather — animations.js
   Dynamic weather background engine + animated SVG icon system.
   Exposes window.BG = { setScene, setSceneFromPayload, icon }.
   ============================================================ */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var canvas = document.getElementById("bg-particles");
  var ctx = canvas ? canvas.getContext("2d") : null;
  var gradA = document.getElementById("bg-a");
  var gradB = document.getElementById("bg-b");
  var cloudsEl = document.getElementById("bg-clouds");
  var fogEl = document.getElementById("bg-fog");
  var celestial = document.getElementById("bg-celestial");
  var lightning = document.getElementById("bg-lightning");

  var activeGrad = gradA;   // currently visible gradient layer
  var currentScene = null;
  var particleMode = "none";
  var particles = [];
  var rafId = null;
  var lightningTimer = null;
  var stars = [];

  /* ---------------------------------------------------------
     Scene mapping
     --------------------------------------------------------- */

  // condition key + day/night -> scene class name
  function sceneFor(condition, isDay) {
    switch (condition) {
      case "clear": return isDay ? "scene-clear-day" : "scene-clear-night";
      case "clear-night": return "scene-clear-night";
      case "partly": return isDay ? "scene-partly-day" : "scene-partly-night";
      case "cloudy": return isDay ? "scene-cloudy" : "scene-cloudy-night";
      case "fog": return isDay ? "scene-fog" : "scene-fog-night";
      case "drizzle": return "scene-drizzle";
      case "rain": return isDay ? "scene-rain" : "scene-rain-night";
      case "heavy-rain": return "scene-heavy-rain";
      case "sleet": return "scene-sleet";
      case "snow": return isDay ? "scene-snow" : "scene-snow-night";
      case "storm": return "scene-storm";
      case "sunrise": return "scene-sunrise";
      case "sunset": return "scene-sunset";
      default: return isDay ? "scene-partly-day" : "scene-partly-night";
    }
  }

  var PARTICLE_FOR = {
    "scene-drizzle": "drizzle",
    "scene-rain": "rain",
    "scene-rain-night": "rain",
    "scene-heavy-rain": "heavy-rain",
    "scene-storm": "heavy-rain",
    "scene-snow": "snow",
    "scene-snow-night": "snow",
    "scene-sleet": "sleet",
    "scene-clear-night": "stars",
    "scene-partly-night": "stars"
  };

  var CLOUD_LEVEL = {
    "scene-clear-day": 0, "scene-clear-night": 0,
    "scene-sunrise": 1, "scene-sunset": 1,
    "scene-partly-day": 1, "scene-partly-night": 1,
    "scene-cloudy": 2, "scene-cloudy-night": 2,
    "scene-fog": 1, "scene-fog-night": 1,
    "scene-drizzle": 2, "scene-rain": 2, "scene-rain-night": 2,
    "scene-heavy-rain": 3, "scene-storm": 3,
    "scene-snow": 2, "scene-snow-night": 2, "scene-sleet": 2
  };

  var CLOUD_DARK = {
    "scene-rain": true, "scene-rain-night": true, "scene-heavy-rain": true,
    "scene-storm": true, "scene-cloudy": true, "scene-cloudy-night": true,
    "scene-snow": false, "scene-snow-night": false
  };

  /* ---------------------------------------------------------
     Public: apply a scene with a smooth cross-fade
     --------------------------------------------------------- */

  function setScene(scene) {
    if (scene === currentScene) return;
    var first = currentScene === null;

    var next = activeGrad === gradA ? gradB : gradA;
    next.className = "bg-layer bg-gradient " + scene;
    // Force reflow so the transition reliably runs
    void next.offsetWidth;
    next.classList.add("visible");
    activeGrad.classList.remove("visible");
    activeGrad = next;

    currentScene = scene;

    // Clouds
    var level = CLOUD_LEVEL[scene] || 0;
    cloudsEl.className = "bg-clouds" + (level ? " level-" + level : "");
    var dark = !!CLOUD_DARK[scene];
    var cloudDivs = cloudsEl.querySelectorAll(".cloud");
    for (var i = 0; i < cloudDivs.length; i++) {
      cloudDivs[i].classList.toggle("dark", dark);
    }

    // Fog
    fogEl.classList.toggle("visible", scene === "scene-fog" || scene === "scene-fog-night");

    // Celestial disc
    celestial.classList.remove("sun", "moon", "visible");
    if (scene === "scene-clear-day" || scene === "scene-sunrise" || scene === "scene-sunset") {
      celestial.classList.add("sun");
      if (scene === "scene-clear-day") celestial.classList.add("visible");
    } else if (scene === "scene-clear-night" || scene === "scene-partly-night") {
      celestial.classList.add("moon", "visible");
    }

    // Particles
    var mode = PARTICLE_FOR[scene] || "none";
    if (mode !== particleMode) {
      particleMode = mode;
      initParticles(mode);
    } else if (mode !== "none") {
      seedParticles(mode);
    }

    // Lightning (storm only)
    clearInterval(lightningTimer);
    lightningTimer = null;
    if (scene === "scene-storm") {
      scheduleLightning();
    }

    if (first && mode === "none") {
      drawFrame(0); // single paint so canvas background is consistent
    }
  }

  function scheduleLightning() {
    if (reducedMotion.matches) return;
    var delay = 4000 + Math.random() * 7000;
    lightningTimer = setTimeout(function () {
      lightning.classList.remove("flash");
      void lightning.offsetWidth;
      lightning.classList.add("flash");
      scheduleLightning();
    }, delay);
  }

  /* Derive the final scene from payload data. Sunrise/sunset windows get
     their own warm gradient when skies are clear or partly cloudy. */
  function setSceneFromPayload(data) {
    var cur = data.current;
    var isDay = !!cur.is_day;
    var condition = cur.condition;

    if (isDay && (condition === "clear" || condition === "partly") && data.sun) {
      var mins = minutesOfDayLocal(data);
      var sunriseM = timeToMinutes(data.sun.sunrise);
      var sunsetM = timeToMinutes(data.sun.sunset);
      if (sunriseM !== null && Math.abs(mins - sunriseM) <= 60) {
        condition = "sunrise";
      } else if (sunsetM !== null && Math.abs(mins - sunsetM) <= 60) {
        condition = "sunset";
      }
    }
    setScene(sceneFor(condition, isDay));
  }

  function timeToMinutes(iso) {
    if (!iso) return null;
    var m = /T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function minutesOfDayLocal(data) {
    var offsetMs = (data.utc_offset_seconds || 0) * 1000;
    var d = new Date(Date.now() + offsetMs);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  /* ---------------------------------------------------------
     Canvas particles: rain / drizzle / heavy rain / snow / stars
     --------------------------------------------------------- */

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function seedParticles(mode) {
    particles = [];
    stars = [];
    var w = window.innerWidth, h = window.innerHeight;
    var i, n;
    if (mode === "rain") n = Math.min(150, Math.floor(w / 9));
    else if (mode === "heavy-rain") n = Math.min(260, Math.floor(w / 5.5));
    else if (mode === "drizzle") n = Math.min(80, Math.floor(w / 16));
    else if (mode === "snow") n = Math.min(110, Math.floor(w / 12));
    else if (mode === "sleet") n = Math.min(120, Math.floor(w / 11));
    else if (mode === "stars") n = Math.min(140, Math.floor(w / 10));

    for (i = 0; i < n; i++) {
      if (mode === "rain" || mode === "heavy-rain" || mode === "drizzle" || mode === "sleet") {
        particles.push({
          x: rand(0, w), y: rand(-h, h),
          len: mode === "drizzle" ? rand(4, 9) : rand(9, 18),
          speed: mode === "drizzle" ? rand(380, 550) : rand(650, 1000),
          drift: mode === "heavy-rain" ? rand(60, 120) : rand(20, 60),
          alpha: mode === "drizzle" ? rand(0.2, 0.4) : rand(0.3, 0.55)
        });
      } else if (mode === "snow") {
        particles.push({
          x: rand(0, w), y: rand(-h, h),
          r: rand(1.2, 3.2),
          speed: rand(35, 85),
          sway: rand(14, 42),
          phase: rand(0, Math.PI * 2),
          alpha: rand(0.45, 0.9)
        });
      } else if (mode === "stars") {
        stars.push({
          x: rand(0, w), y: rand(0, h * 0.65),
          r: rand(0.5, 1.6),
          tw: rand(0.5, 2.4),
          phase: rand(0, Math.PI * 2),
          alpha: rand(0.35, 0.95)
        });
      }
    }
  }

  function initParticles(mode) {
    resizeCanvas();
    seedParticles(mode);
    canvas.style.opacity = mode === "none" ? "0" : "1";
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (mode === "none") { ctx && ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    if (reducedMotion.matches) {
      drawFrame(0); // one static frame only
      return;
    }
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  var lastT = 0;

  function loop(t) {
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    drawFrame(t / 1000, dt);
    rafId = requestAnimationFrame(loop);
  }

  function drawFrame(t, dt) {
    if (!ctx) return;
    var w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    var i, p;

    if (particleMode === "stars") {
      ctx.fillStyle = "#ffffff";
      for (i = 0; i < stars.length; i++) {
        p = stars[i];
        var tw = reducedMotion.matches ? 1 : 0.6 + 0.4 * Math.sin(t * p.tw + p.phase);
        ctx.globalAlpha = p.alpha * tw;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (particleMode === "none") return;

    var isSnow = particleMode === "snow";
    var isSleetRain = particleMode === "sleet";

    ctx.lineCap = "round";
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      if (!reducedMotion.matches) {
        p.y += p.speed * dt;
        p.x += (isSnow ? Math.sin(t * 0.9 + p.phase) * p.sway * dt : p.drift * dt);
        if (p.y > h + 20) { p.y = rand(-40, -5); p.x = rand(-20, w + 20); }
        if (p.x > w + 30) p.x = -20;
      }

      if (isSnow) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // rain / drizzle / sleet lines
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = "rgba(190, 216, 245, 0.9)";
        ctx.lineWidth = p.len > 12 ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + (p.drift || 30) * 0.02, p.y + p.len);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  window.addEventListener("resize", function () {
    resizeCanvas();
    seedParticles(particleMode);
    if (reducedMotion.matches || particleMode === "none") drawFrame(0);
  });

  // Pause animation loop when the tab is hidden (performance)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (particleMode !== "none" && !reducedMotion.matches && !rafId) {
      lastT = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  });

  reducedMotion.addEventListener && reducedMotion.addEventListener("change", function () {
    if (particleMode !== "none") initParticles(particleMode);
  });

  /* ---------------------------------------------------------
     Animated SVG weather icons (consistent original style)
     --------------------------------------------------------- */

  var C = {
    sun: "#FFD36E", sunDeep: "#F5A623",
    moon: "#E8EEFB", cloud: "#F2F6FF", cloudDark: "#C6D2E4",
    rain: "#8FC5F2", bolt: "#FFD36E", flake: "#DCEBFA", fog: "#C8D2DC"
  };

  function svgWrap(inner, viewBox) {
    return '<svg viewBox="' + (viewBox || "0 0 64 64") + '" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + "</svg>";
  }

  function sunCore(x, y, r) {
    var rays = "";
    for (var i = 0; i < 8; i++) {
      var a = (Math.PI / 4) * i;
      var x1 = x + Math.cos(a) * (r + 4), y1 = y + Math.sin(a) * (r + 4);
      var x2 = x + Math.cos(a) * (r + 9), y2 = y + Math.sin(a) * (r + 9);
      rays += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
        '" stroke="' + C.sun + '" stroke-width="2.6" stroke-linecap="round"/>';
    }
    return '<g class="wi-sun-ring">' + rays + "</g>" +
      '<circle class="wi-sun-core" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.sun + '"/>' +
      '<circle class="wi-sun-core" cx="' + x + '" cy="' + y + '" r="' + (r - 3) + '" fill="' + C.sunDeep + '" opacity="0.35"/>';
  }

  function cloudPath(x, y, s, fill, opacity) {
    return '<path class="wi-cloud-body" transform="translate(' + x + "," + y + ") scale(" + s + ')" fill="' + fill + '"' +
      (opacity ? ' opacity="' + opacity + '"' : "") +
      ' d="M20 46c-6.6 0-12-5.4-12-12 0-6 4.4-11 10.1-11.8C19.6 15.6 25.9 11 33 11c8.3 0 15.2 6.1 16.3 14 5.3.5 9.7 5 9.7 10.5 0 5.8-4.7 10.5-10.5 10.5H20z"/>';
  }

  function drops(count, color) {
    var out = "";
    var xs = [26, 32, 38, 44, 21];
    for (var i = 0; i < count; i++) {
      out += '<line class="wi-drop" x1="' + xs[i] + '" y1="48" x2="' + (xs[i] - 2) + '" y2="54" stroke="' + (color || C.rain) + '" stroke-width="2.6" stroke-linecap="round"/>';
    }
    return out;
  }

  function flakes(count) {
    var out = "";
    var xs = [24, 32, 40, 28, 44];
    for (var i = 0; i < count; i++) {
      var x = xs[i], y = 50;
      out += '<g class="wi-flake" transform="translate(' + x + "," + y + ')">' +
        '<line x1="-3.4" y1="0" x2="3.4" y2="0" stroke="' + C.flake + '" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="0" y1="-3.4" x2="0" y2="3.4" stroke="' + C.flake + '" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="-2.4" y1="-2.4" x2="2.4" y2="2.4" stroke="' + C.flake + '" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="-2.4" y1="2.4" x2="2.4" y2="-2.4" stroke="' + C.flake + '" stroke-width="2" stroke-linecap="round"/>' +
        "</g>";
    }
    return out;
  }

  var ICONS = {
    "clear-day": function () {
      return svgWrap(sunCore(32, 32, 12));
    },
    "clear-night": function () {
      return svgWrap(
        '<path d="M41 39a16.5 16.5 0 0 1-14.6-24.3A17 17 0 1 0 44.6 36c-1.2.7-2.4 1.2-3.6 1.5z" fill="' + C.moon + '"/>' +
        '<circle class="wi-star" cx="46" cy="16" r="1.8" fill="' + C.moon + '"/>' +
        '<circle class="wi-star" cx="52" cy="26" r="1.3" fill="' + C.moon + '"/>' +
        '<circle class="wi-star" cx="14" cy="14" r="1.4" fill="' + C.moon + '"/>'
      );
    },
    "partly-day": function () {
      return svgWrap(sunCore(40, 22, 10) + cloudPath(-2, 6, 0.85, C.cloud));
    },
    "partly-night": function () {
      return svgWrap(
        '<path d="M47 26a10.5 10.5 0 0 1-9.3-15.5A10.8 10.8 0 1 0 50.3 25c-1 .6-2.1 1-3.3.9z" fill="' + C.moon + '" opacity="0.9"/>' +
        cloudPath(-2, 10, 0.85, C.cloud)
      );
    },
    "cloudy": function () {
      return svgWrap(cloudPath(-8, 0, 0.7, C.cloudDark, 0.7) + cloudPath(2, 8, 0.9, C.cloud));
    },
    "fog": function () {
      return svgWrap(cloudPath(4, -2, 0.8, C.cloud) +
        '<line class="wi-fogline" x1="14" y1="50" x2="50" y2="50" stroke="' + C.fog + '" stroke-width="3" stroke-linecap="round"/>' +
        '<line class="wi-fogline" x1="18" y1="57" x2="46" y2="57" stroke="' + C.fog + '" stroke-width="3" stroke-linecap="round" opacity="0.7"/>');
    },
    "drizzle": function () {
      return svgWrap(cloudPath(2, 2, 0.85, C.cloud) + drops(3, C.rain));
    },
    "rain": function () {
      return svgWrap(cloudPath(2, 2, 0.85, C.cloud) + drops(4, C.rain));
    },
    "heavy-rain": function () {
      return svgWrap(cloudPath(2, 2, 0.85, C.cloudDark) + drops(5, "#6FB4EE"));
    },
    "sleet": function () {
      return svgWrap(cloudPath(2, 2, 0.85, C.cloud) +
        '<line class="wi-drop" x1="26" y1="48" x2="24" y2="54" stroke="' + C.rain + '" stroke-width="2.6" stroke-linecap="round"/>' +
        flakes(2));
    },
    "snow": function () {
      return svgWrap(cloudPath(2, 2, 0.85, C.cloud) + flakes(3));
    },
    "storm": function () {
      return svgWrap(cloudPath(2, 0, 0.85, C.cloudDark) +
        '<path class="wi-bolt" d="M33 44l-7 11h6l-3 9 10-13h-6l4-7z" fill="' + C.bolt + '"/>' +
        drops(2, C.rain));
    },
    "wind": function () {
      return svgWrap(
        '<path class="wi-wind-line" d="M10 24h26a6 6 0 1 0-6-6" stroke="' + C.cloud + '" stroke-width="3" stroke-linecap="round"/>' +
        '<path class="wi-wind-line" d="M10 34h34a6 6 0 1 1-6 6" stroke="' + C.cloud + '" stroke-width="3" stroke-linecap="round" style="animation-delay:.5s"/>' +
        '<path class="wi-wind-line" d="M14 44h18a5 5 0 1 1-5 5" stroke="' + C.cloud + '" stroke-width="3" stroke-linecap="round" style="animation-delay:1s"/>'
      );
    }
  };

  function icon(condition, isDay, size) {
    var key;
    switch (condition) {
      case "clear": key = isDay ? "clear-day" : "clear-night"; break;
      case "clear-night": key = "clear-night"; break;
      case "partly": key = isDay ? "partly-day" : "partly-night"; break;
      case "cloudy": key = "cloudy"; break;
      case "fog": key = "fog"; break;
      case "drizzle": key = "drizzle"; break;
      case "rain": key = "rain"; break;
      case "heavy-rain": key = "heavy-rain"; break;
      case "sleet": key = "sleet"; break;
      case "snow": key = "snow"; break;
      case "storm": key = "storm"; break;
      case "wind": key = "wind"; break;
      case "sunrise": key = "partly-day"; break;
      case "sunset": key = "partly-day"; break;
      default: key = isDay ? "partly-day" : "partly-night";
    }
    var fn = ICONS[key] || ICONS["cloudy"];
    return fn();
  }

  window.BG = {
    setScene: setScene,
    setSceneFromPayload: setSceneFromPayload,
    icon: icon,
    sceneFor: sceneFor
  };
})();
