<p align="center">
  <img width="32%" src="https://github.com/user-attachments/assets/058a8126-ec16-4a29-954c-98a184c1fe75" alt="Weather Dashboard"/>
  <img width="32%" src="https://github.com/user-attachments/assets/dad980d7-37e6-4c63-afaf-2cc575bb3ac5" alt="Hourly Forecast"/>
  <img width="32%" src="https://github.com/user-attachments/assets/a01a2331-2be7-4acd-b548-6449289d4d82" alt="Five-Day Forecast and Air Quality"/>
</p>

<p align="center">
  <img width="24%" src="https://github.com/user-attachments/assets/ce0f0d16-5f25-41d8-87cd-6c4d0d7cc474" alt="Weather Details and Map"/>
  <img width="24%" src="https://github.com/user-attachments/assets/b613b243-82ff-418a-8ad4-2d064b52f463" alt="Weather Settings"/>
  <img width="24%" src="https://github.com/user-attachments/assets/012a4064-aad6-4ce3-ac6f-1d7382e0f471" alt="City Search"/>
  <img width="24%" src="https://github.com/user-attachments/assets/a5561c8e-5de1-4bc2-ac2e-2cccd4e25a38" alt="Selected Location"/>
</p>

# 🌤️ AtmosWeather

---

## 🌦️ About The Project

**AtmosWeather** is a premium weather application inspired by modern mobile
weather experiences such as Vivo Weather, redesigned with an original
glassmorphism interface.

The application provides real-time weather information for cities around the
world with dynamic weather backgrounds, animated weather icons, forecasts,
air-quality information, sunrise/sunset visualization and precipitation radar.

The interface is designed to provide a clean, immersive and responsive weather
experience across desktop, tablet and mobile devices.

---

## ✨ Features

### 🌡️ Weather Information

- 🌍 Worldwide city weather search
- 🌡️ Current temperature
- 🤗 Feels-like temperature
- 💧 Humidity
- 💨 Wind speed, direction and gusts
- 🧭 Wind compass
- 📊 Atmospheric pressure
- 👁️ Visibility
- ☀️ UV index
- 💦 Dew point
- ☁️ Cloud cover
- 🌧️ Precipitation
- 🌙 Moon phase

### 📅 Forecasts

- ⏱️ 24-hour hourly forecast
- 📈 Interactive temperature trend
- 📆 5-day weather forecast
- 🔎 Detailed daily forecast modal
- 🔄 Automatic weather refresh

### 🌅 Sun & Moon

- ☀️ Sunrise time
- 🌇 Sunset time
- 🌞 Daylight duration
- 🌙 Current moon phase
- 🌕 Moon illumination
- 📍 Dynamic solar-position visualization

### 🌫️ Air Quality

Displays:

- US AQI
- PM2.5
- PM10
- O₃
- NO₂
- SO₂
- CO

Air-quality information is automatically hidden or degraded gracefully when
the provider does not return the required data.

### 🗺️ Live Weather Radar

- 📡 Live precipitation radar
- 🗺️ Interactive map
- 📍 Current city marker
- 🔍 Zoom and pan
- 🌧️ RainViewer radar overlay
- 🌍 Dynamic map centering based on selected city

### 🔎 Global Search

- Search cities worldwide
- Debounced autocomplete
- State and country information
- Location disambiguation
- Recent searches

### ⭐ Favorites

- Add cities to favorites
- Remove favorites
- Reorder favorite locations
- Persist favorite locations locally

### 🎨 Themes

- 🌙 Dark mode
- ☀️ Light mode
- 🖥️ System theme
- Dynamic weather backgrounds remain active across themes

### 📐 Units

Supports instant switching between:

- °C / °F
- km/h / mph / m/s
- hPa / inHg
- km / miles

### 📱 Progressive Web App

- Installable PWA
- Service worker
- Offline application shell
- Responsive mobile navigation

### ♿ Accessibility

- Semantic HTML
- ARIA labels
- Keyboard navigation
- Visible focus states
- Reduced-motion support
- Responsive layouts

---

## 🛠️ Tech Stack

### Backend

- **Python 3**
- **Django 6**
- Django Cache Framework
- WhiteNoise
- Gunicorn

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- SVG
- Glassmorphism UI
- Leaflet

### APIs & Services

| Service | Purpose |
|---|---|
| Open-Meteo | Weather forecast |
| Open-Meteo Geocoding | Worldwide city search |
| Open-Meteo Air Quality | AQI and pollutants |
| BigDataCloud | Reverse geocoding |
| RainViewer | Precipitation radar |

### Database

- SQLite — Development
- PostgreSQL — Production

---

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │      User / PWA     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Django Frontend   │
                    │ HTML / CSS / JS /   │
                    │ SVG / Leaflet       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Django Backend   │
                    │ Views / Services /  │
                    │ Cache / Utils       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐   ┌────────────┐   ┌────────────┐
       │ Open-Meteo │   │BigDataCloud│   │ RainViewer │
       │ Weather    │   │ Geocoding  │   │   Radar    │
       └────────────┘   └────────────┘   └────────────┘
````

---

## 📁 Project Structure

```text
AtmosWeather/
│
├── config/
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
│
├── weather/
│   ├── views.py
│   ├── urls.py
│   ├── models.py
│   ├── services/
│   └── utils/
│
├── templates/
│   └── weather/
│       └── index.html
│
├── static/
│   ├── css/
│   │   └── style.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   ├── weather.js
│   │   ├── animations.js
│   │   └── secrets.js
│   │
│   ├── icons/
│   ├── manifest.json
│   └── sw.js
│
├── manage.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

# 🚀 Installation

## 1. Clone the Repository

```bash
git clone https://github.com/AamirShaikh5176/atmosweather.git
```

```bash
cd atmosweather
```

---

## 2. Create a Virtual Environment

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

---

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 4. Configure Environment Variables

Create a `.env` file:

```env
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
WEATHER_CACHE_TTL=600
```

For production:

```env
DJANGO_DEBUG=False
```

Never commit `.env` to GitHub.

---

## 5. Run Database Migrations

```bash
python manage.py migrate
```

---

## 6. Start the Development Server

```bash
python manage.py runserver
```

Open:

```text
http://127.0.0.1:8000/
```

---

# 🔌 API Configuration

AtmosWeather uses primarily free/public APIs.

### Open-Meteo

Used for:

* Current weather
* Weather forecasts
* Worldwide geocoding
* Air quality

No API key is required.

### BigDataCloud

Used for:

* Reverse geocoding
* Converting coordinates into readable location information

### RainViewer

Used for:

* Live precipitation radar
* Radar map overlays

### Map Provider

The weather map uses the configured map tile provider together with the
RainViewer radar overlay.

Any client-side map key should be restricted to the deployed domain.

---

# 🔐 Security

Sensitive configuration should never be committed to GitHub.

The following files should remain ignored:

```text
.env
db.sqlite3
static/js/secrets.js
__pycache__/
*.pyc
venv/
```

Before pushing the project:

```bash
git status
```

Make sure no API keys, passwords or secret keys are being tracked.

---

# 🗄️ Database

### Development

SQLite is used for local development:

```text
db.sqlite3
```

### Production

PostgreSQL is recommended for production deployments.

Configure the production database using:

```env
DJANGO_DB_ENGINE=postgres
DJANGO_DB_NAME=your_database
DJANGO_DB_USER=your_user
DJANGO_DB_PASSWORD=your_password
DJANGO_DB_HOST=your_host
DJANGO_DB_PORT=5432
```

---

# ☁️ Deployment

AtmosWeather can be deployed on:

* **Render**
* **Railway**
* **PythonAnywhere**
* VPS / cloud servers
* Other Python/Django-compatible hosting platforms

### Production Commands

```bash
pip install -r requirements.txt
```

```bash
python manage.py migrate
```

```bash
python manage.py collectstatic --noinput
```

```bash
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
```

For production:

```env
DJANGO_DEBUG=False
```

Use PostgreSQL instead of SQLite for the production database.

---

# ⚡ Performance

AtmosWeather includes:

* Weather response caching
* Debounced city search
* Skeleton loading states
* Efficient API requests
* Conditional data rendering
* Responsive layouts
* Service-worker support
* Reduced-motion support
* Smooth weather and UI animations

---

# 📱 Responsive Design

AtmosWeather is designed for multiple screen sizes.

### Desktop

```text
┌──────────────────────────────────────────┐
│ Sidebar │       Weather Dashboard       │
│         │                               │
│ Home    │ Current Weather               │
│ Fav.    │ Forecast                      │
│ Settings│ Air Quality / Radar           │
└──────────────────────────────────────────┘
```

### Mobile

```text
┌──────────────────────┐
│   AtmosWeather       │
│                      │
│   Current Weather    │
│                      │
│   Forecast           │
│                      │
│   Weather Details    │
│                      │
├──────────────────────┤
│ Home Locations ★ ⚙  │
└──────────────────────┘
```

---

# 📊 Data Integrity

AtmosWeather does not fabricate weather information.

Weather values, forecasts, air-quality measurements and radar information are
obtained from the configured providers.

When information is unavailable, the application gracefully displays loading,
empty or unavailable states instead of fabricating values.

---

# 🎯 Future Improvements

Potential future enhancements include:

* 🔔 Weather notifications
* ⚠️ Severe weather alerts
* 🗺️ Additional radar layers
* 📱 Home-screen weather widgets
* 🌡️ Historical weather information
* 🔄 Weather comparison between cities
* 🤖 Personalized weather recommendations
* 📡 Expanded offline capabilities
* 🌍 More advanced weather-map layers

---

# 👨‍💻 Author

## Aamir Shaikh

**B.Tech Information Technology**
Bharati Vidyapeeth (Deemed to be University) College of Engineering, Pune

### Connect With Me

* LinkedIn: [https://www.linkedin.com/in/aamirshaikh5176/](https://www.linkedin.com/in/aamirshaikh5176/)
* GitHub: [https://github.com/AamirShaikh5176](https://github.com/AamirShaikh5176)

---

# ⭐ Support

If you find **AtmosWeather** useful, consider giving the repository a ⭐ on
GitHub.

---

## 📄 License

This project is developed for educational, portfolio and demonstration
purposes.

---
