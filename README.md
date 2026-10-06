# AtmosWeather

A premium, Vivo-Weather-inspired weather application built with **Python + Django** and a polished
**glassmorphism UI**. Fully original design: animated dynamic weather backgrounds, frosted glass
cards, hourly/5-day forecasts, live precipitation radar, air quality, favorites, units, light/dark
themes, and PWA support.

## Features

- **Live weather worldwide** via [Open-Meteo](https://open-meteo.com) — no API key required
- **Dynamic animated backgrounds** that react to real conditions: clear day/night, clouds, rain,
  heavy rain, thunderstorms with lightning, snow, fog, plus sunrise/sunset gradients
- **Animated SVG weather icons** (consistent original icon system, no random emojis)
- Current conditions: temperature, feels-like, humidity, wind + compass + gusts, pressure,
  visibility, UV index, dew point, cloud cover, precipitation, moon phase
- **24-hour hourly forecast** with a smooth interactive temperature-trend graph
- **5-day forecast** — tap any day for a detailed breakdown modal
- **Sun & Moon card**: animated sun path showing the sun's real-time position, daylight duration,
  moon phase and illumination
- **Air quality** (US AQI, PM2.5, PM10, O₃, NO₂, SO₂, CO) — hidden automatically when unavailable
- **Live precipitation radar map** (RainViewer tiles over OpenStreetMap, no key needed)
- **Global city search** with debounced autocomplete showing state/country to disambiguate
- **Use My Location** via browser geolocation + reverse geocoding
- **Favorites** (add / remove / reorder) and **recent searches**, persisted in localStorage
- **Units**: °C/°F, km/h / mph / m/s, hPa / inHg, km / miles — instant switching
- **Light / Dark / System theme** — weather backgrounds stay active regardless of theme
- Auto-refresh every 10 minutes + manual refresh with "Updated X ago"
- Skeleton loaders, friendly error states, empty states, toasts
- **PWA**: installable, service worker with offline shell
- Responsive: desktop sidebar + full dashboard, mobile bottom navigation, proper mobile layouts
- Accessibility: semantic HTML, ARIA labels, keyboard navigation (`/` focuses search, `Esc` closes
  overlays), focus states, `prefers-reduced-motion` support

## Technologies

| Layer     | Tech                                                        |
|-----------|-------------------------------------------------------------|
| Backend   | Python 3, Django 6, Django cache framework, WhiteNoise      |
| APIs      | Open-Meteo (forecast/geocoding/air quality), BigDataCloud (reverse geocoding), RainViewer (radar) |
| Frontend  | HTML5, CSS3 (glassmorphism), vanilla JS, SVG animations, Leaflet |
| Data      | SQLite (dev) — PostgreSQL-ready via `DJANGO_DB_*` env vars  |

## API Setup

No keys are required for the default providers (Open-Meteo, RainViewer, BigDataCloud's free
client endpoint). If you switch to a keyed provider, put the key in `.env` as `WEATHER_API_KEY=…`
and never hardcode it in source.

## Environment Variables

Copy `.env.example` to `.env` and adjust:

| Variable                 | Default | Purpose                                  |
|--------------------------|---------|------------------------------------------|
| `DJANGO_SECRET_KEY`      | dev fallback | Set a strong random value in production |
| `DJANGO_DEBUG`           | `True`  | Must be `False` in production            |
| `DJANGO_ALLOWED_HOSTS`   | `*`     | Comma-separated host list                |
| `WEATHER_API_KEY`        | *(empty)* | Reserved for keyed weather providers   |
| `DJANGO_DB_ENGINE`       | *(empty)* | Set to `postgres` for PostgreSQL       |
| `DJANGO_DB_*`            | —       | `NAME`, `USER`, `PASSWORD`, `HOST`, `PORT` |
| `WEATHER_CACHE_TTL`      | `600`   | Weather cache lifetime (seconds)         |

## Local Development

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Open http://127.0.0.1:8000.

## Replit

The project is Replit-ready via `.replit`:

1. Import/upload the project into a Replit Python repl.
2. Press **Run** — it executes `python manage.py runserver 0.0.0.0:8000`.
3. The webview opens the app automatically (port 8000 is mapped externally).

For Replit deployments, the `[deploy]` block runs migrations, collects static files, and starts
Gunicorn bound to `$PORT`.

## Docker / Production

```bash
docker build -t atmosweather .
docker run -p 8080:8080 -e DJANGO_SECRET_KEY=<strong-secret> atmosweather
```

The container listens on the injected `PORT` (default 8080), applies migrations, serves static
files through WhiteNoise with compression, and keeps `DEBUG=False`.

## Project Structure

```
├── manage.py
├── requirements.txt
├── .env / .env.example
├── .replit
├── Dockerfile
├── config/            # settings, urls, wsgi, asgi
├── weather/           # views, urls, services (all API logic), utils, models
├── templates/weather/ # index.html
└── static/
    ├── css/style.css
    ├── js/  app.js · weather.js · animations.js
    ├── icons/  favicon + PWA icons
    ├── manifest.json
    └── sw.js
```

## Data Integrity

The app never fabricates weather data. Alerts always come from the provider (Open-Meteo currently
offers no alert feed, so the UI shows the "no active alerts" state). Air quality and radar are
hidden/degraded gracefully when unavailable. Summaries are rule-based and only state what the API
data supports.
