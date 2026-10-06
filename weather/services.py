"""Open-Meteo integration: geocoding, weather, air quality, reverse geocoding.

All external API logic lives here, kept separate from Django views. Responses
are cached (Django cache framework) to avoid hammering the API. Every public
function raises WeatherServiceError with a user-friendly message on failure —
raw exceptions never reach the client.
"""

import logging
from datetime import datetime, timezone

import requests
from django.conf import settings
from django.core.cache import cache

from .utils import (
    aqi_category,
    build_summary,
    map_condition,
    moon_phase,
    uv_category,
    wind_compass,
)

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

HOURLY_FIELDS = [
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "uv_index",
    "visibility",
    "dew_point_2m",
    "is_day",
]

DAILY_FIELDS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "sunrise",
    "sunset",
    "daylight_duration",
    "uv_index_max",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
]

CURRENT_FIELDS = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
]


class WeatherServiceError(Exception):
    """User-facing weather service failure."""


def _get(url, params):
    timeout = getattr(settings, "WEATHER_TIMEOUT", 10)
    try:
        response = requests.get(url, params=params, timeout=timeout)
    except requests.Timeout:
        raise WeatherServiceError(
            "The weather service took too long to respond. Please try again."
        )
    except requests.ConnectionError:
        raise WeatherServiceError(
            "Could not reach the weather service. Check your internet connection."
        )
    except requests.RequestException:
        raise WeatherServiceError(
            "Weather data is temporarily unavailable. Please try again."
        )
    if response.status_code == 429:
        raise WeatherServiceError(
            "Weather service rate limit reached. Please wait a moment and retry."
        )
    if response.status_code != 200:
        logger.warning("Upstream %s returned %s", url, response.status_code)
        raise WeatherServiceError(
            "Weather data is temporarily unavailable. Please try again."
        )
    try:
        return response.json()
    except ValueError:
        raise WeatherServiceError("Received malformed weather data. Please retry.")


def _fmt_coord(value):
    return f"{float(value):.3f}"


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

def geocode(query, count=8):
    """Search locations worldwide. Returns a list of place dicts."""
    query = (query or "").strip()
    if len(query) < 2:
        return []
    data = _get(
        GEOCODE_URL,
        {"name": query, "count": count, "language": "en", "format": "json"},
    )
    results = []
    for item in data.get("results") or []:
        results.append(
            {
                "name": item.get("name", ""),
                "admin1": item.get("admin1") or "",
                "country": item.get("country") or "",
                "country_code": item.get("country_code") or "",
                "lat": item.get("latitude"),
                "lon": item.get("longitude"),
                "timezone": item.get("timezone") or "",
                "population": item.get("population") or 0,
            }
        )
    return results


def reverse_geocode(lat, lon):
    """Resolve coordinates to a place label (no API key required)."""
    data = _get(
        REVERSE_URL,
        {"latitude": _fmt_coord(lat), "longitude": _fmt_coord(lon), "localityLanguage": "en"},
    )
    city = data.get("city") or data.get("locality") or data.get("principalSubdivision") or ""
    if not city:
        city = data.get("localityInfo", {}).get("administrative", [{}])[0].get("name", "") \
            if data.get("localityInfo", {}).get("administrative") else "My Location"
    return {
        "name": city or "My Location",
        "admin1": data.get("principalSubdivision") or "",
        "country": data.get("countryname") or data.get("countryName") or "",
        "country_code": data.get("countryCode") or "",
        "lat": float(lat),
        "lon": float(lon),
        "timezone": "",
    }


# ---------------------------------------------------------------------------
# Weather payload
# ---------------------------------------------------------------------------

def fetch_air_quality(lat, lon):
    """Fetch US-AQI air quality. Returns None when unavailable."""
    try:
        data = _get(
            AIR_URL,
            {
                "latitude": _fmt_coord(lat),
                "longitude": _fmt_coord(lon),
                "current": "us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
                "timezone": "auto",
            },
        )
    except WeatherServiceError:
        return None
    current = data.get("current") or {}
    us_aqi = current.get("us_aqi")
    category, css = aqi_category(us_aqi)
    if us_aqi is None:
        return None
    return {
        "aqi": us_aqi,
        "category": category,
        "css_class": css,
        "pm2_5": current.get("pm2_5"),
        "pm10": current.get("pm10"),
        "co": current.get("carbon_monoxide"),
        "no2": current.get("nitrogen_dioxide"),
        "so2": current.get("sulphur_dioxide"),
        "o3": current.get("ozone"),
    }


def fetch_weather(lat, lon, place=None, force=False):
    """Build the complete weather payload for a coordinate pair."""
    lat_f, lon_f = float(lat), float(lon)
    if not (-90 <= lat_f <= 90) or not (-180 <= lon_f <= 180):
        raise WeatherServiceError("Invalid coordinates.")

    ttl = getattr(settings, "WEATHER_CACHE_TTL", 600)
    cache_key = f"weather:{_fmt_coord(lat_f)}:{_fmt_coord(lon_f)}"
    cached = None if force else cache.get(cache_key)
    if cached is not None:
        payload = dict(cached)
        payload["cached"] = True
        return payload

    data = _get(
        FORECAST_URL,
        {
            "latitude": _fmt_coord(lat_f),
            "longitude": _fmt_coord(lon_f),
            "current": ",".join(CURRENT_FIELDS),
            "hourly": ",".join(HOURLY_FIELDS),
            "daily": ",".join(DAILY_FIELDS),
            "timezone": "auto",
            "forecast_days": "7",
            "wind_speed_unit": "kmh",
        },
    )

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        raise WeatherServiceError("Weather data is incomplete. Please try again.")

    # Slice the next 24 hours starting at the current local hour.
    local_now = data.get("current", {}).get("time") or times[0]
    try:
        start_idx = times.index(local_now.rsplit(":", 1)[0] + ":00")
    except ValueError:
        start_idx = 0
    start_idx = max(0, start_idx)

    hourly_list = []
    for i in range(start_idx, min(start_idx + 24, len(times))):
        iso = times[i]
        code = hourly.get("weather_code", [None] * len(times))[i]
        is_day = bool(hourly.get("is_day", [1] * len(times))[i])
        key, label = map_condition(code, is_day)
        hourly_list.append(
            {
                "time": iso,
                "temp": hourly.get("temperature_2m", [None] * len(times))[i],
                "feels": hourly.get("apparent_temperature", [None] * len(times))[i],
                "pop": hourly.get("precipitation_probability", [None] * len(times))[i],
                "precip": hourly.get("precipitation", [None] * len(times))[i],
                "code": code,
                "label": label,
                "condition": key,
                "is_day": is_day,
                "humidity": hourly.get("relative_humidity_2m", [None] * len(times))[i],
                "wind": hourly.get("wind_speed_10m", [None] * len(times))[i],
                "wind_dir": hourly.get("wind_direction_10m", [None] * len(times))[i],
                "uv": hourly.get("uv_index", [None] * len(times))[i],
                "vis": hourly.get("visibility", [None] * len(times))[i],
                "dew": hourly.get("dew_point_2m", [None] * len(times))[i],
            }
        )

    daily = data.get("daily") or {}
    daily_list = []
    for i in range(min(5, len(daily.get("time", [])))):
        code = daily.get("weather_code", [None] * 5)[i]
        key, label = map_condition(code, True)
        daily_list.append(
            {
                "date": daily.get("time", [""] * 5)[i],
                "code": code,
                "label": label,
                "condition": key,
                "max": daily.get("temperature_2m_max", [None] * 5)[i],
                "min": daily.get("temperature_2m_min", [None] * 5)[i],
                "feels_max": daily.get("apparent_temperature_max", [None] * 5)[i],
                "feels_min": daily.get("apparent_temperature_min", [None] * 5)[i],
                "pop": daily.get("precipitation_probability_max", [None] * 5)[i],
                "precip": daily.get("precipitation_sum", [None] * 5)[i],
                "uv_max": daily.get("uv_index_max", [None] * 5)[i],
                "uv_max_label": uv_category(daily.get("uv_index_max", [None] * 5)[i]),
                "wind_max": daily.get("wind_speed_10m_max", [None] * 5)[i],
                "gust_max": daily.get("wind_gusts_10m_max", [None] * 5)[i],
                "wind_dir": daily.get("wind_direction_10m_dominant", [None] * 5)[i],
                "sunrise": daily.get("sunrise", [None] * 5)[i],
                "sunset": daily.get("sunset", [None] * 5)[i],
                "daylight": daily.get("daylight_duration", [None] * 5)[i],
            }
        )

    current = data.get("current") or {}
    cur_code = current.get("weather_code")
    cur_is_day = bool(current.get("is_day", 1))
    cur_key, cur_label = map_condition(cur_code, cur_is_day)

    air = fetch_air_quality(lat_f, lon_f)

    utc_offset = data.get("utc_offset_seconds", 0)

    # Derived facts, all sourced from API data
    sunrise = daily_list[0]["sunrise"] if daily_list else None
    sunset = daily_list[0]["sunset"] if daily_list else None
    daylight = daily_list[0].get("daylight") if daily_list else None
    moon_name, moon_illum = moon_phase(datetime.now(timezone.utc))

    payload = {
        "place": place
        or {
            "name": "My Location",
            "admin1": "",
            "country": "",
            "country_code": "",
            "lat": lat_f,
            "lon": lon_f,
        },
        "timezone": data.get("timezone", "UTC"),
        "timezone_abbr": data.get("timezone_abbreviation", ""),
        "utc_offset_seconds": utc_offset,
        "current": {
            "temp": current.get("temperature_2m"),
            "feels": current.get("apparent_temperature"),
            "humidity": current.get("relative_humidity_2m"),
            "code": cur_code,
            "label": cur_label,
            "condition": cur_key,
            "is_day": cur_is_day,
            "precip": current.get("precipitation"),
            "cloud": current.get("cloud_cover"),
            "pressure": current.get("pressure_msl"),
            "wind": current.get("wind_speed_10m"),
            "wind_dir": current.get("wind_direction_10m"),
            "wind_compass": wind_compass(current.get("wind_direction_10m")),
            "gusts": current.get("wind_gusts_10m"),
            "time": current.get("time"),
        },
        "hourly": hourly_list,
        "daily": daily_list,
        "sun": {
            "sunrise": sunrise,
            "sunset": sunset,
            "daylight": daylight,
        },
        "moon": {"phase": moon_name, "illumination": moon_illum},
        "air_quality": air,
        "alerts": [],  # Open-Meteo provides no alert feed; the UI shows the empty state. Never fabricated.
        "summary": build_summary(
            {
                "temperature": current.get("temperature_2m"),
                "weather_code": cur_code,
                "is_day": cur_is_day,
                "humidity": current.get("relative_humidity_2m"),
            },
            daily_list[0] if daily_list else None,
            hourly_list,
        ),
        "units": {"temp": "°C", "wind": "km/h", "pressure": "hPa", "visibility": "km", "precip": "mm"},
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    cache.set(cache_key, payload, ttl)
    return payload
