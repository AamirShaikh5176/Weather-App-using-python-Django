"""Weather condition mapping, unit conversion, and rule-based summaries.

All helpers are pure functions so they can be reused by views and services.
Every value returned is derived from real API data; nothing is fabricated.
"""

import math
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# WMO weather interpretation codes (Open-Meteo)
# ---------------------------------------------------------------------------

# key: stable identifier used by the background engine and icon system
WMO_CONDITIONS = {
    0: ("clear", "Clear Sky"),
    1: ("clear", "Mainly Clear"),
    2: ("partly", "Partly Cloudy"),
    3: ("cloudy", "Overcast"),
    45: ("fog", "Fog"),
    48: ("fog", "Rime Fog"),
    51: ("drizzle", "Light Drizzle"),
    53: ("drizzle", "Drizzle"),
    55: ("drizzle", "Dense Drizzle"),
    56: ("sleet", "Freezing Drizzle"),
    57: ("sleet", "Freezing Drizzle"),
    61: ("rain", "Light Rain"),
    63: ("rain", "Rain"),
    65: ("heavy-rain", "Heavy Rain"),
    66: ("sleet", "Freezing Rain"),
    67: ("sleet", "Freezing Rain"),
    71: ("snow", "Light Snow"),
    73: ("snow", "Snow"),
    75: ("snow", "Heavy Snow"),
    77: ("snow", "Snow Grains"),
    80: ("rain", "Light Showers"),
    81: ("rain", "Rain Showers"),
    82: ("heavy-rain", "Violent Showers"),
    85: ("snow", "Snow Showers"),
    86: ("snow", "Heavy Snow Showers"),
    95: ("storm", "Thunderstorm"),
    96: ("storm", "Thunderstorm with Hail"),
    99: ("storm", "Severe Thunderstorm"),
}


def map_condition(code, is_day=True):
    """Return (condition_key, human_label) for a WMO code."""
    key, label = WMO_CONDITIONS.get(int(code or 0), ("cloudy", "Unknown"))
    if key == "clear" and not is_day:
        key = "clear-night"
    return key, label


# ---------------------------------------------------------------------------
# Air quality categories (US AQI)
# ---------------------------------------------------------------------------

AQI_CATEGORIES = [
    (50, "Good", "aqi-good"),
    (100, "Moderate", "aqi-moderate"),
    (150, "Unhealthy for Sensitive Groups", "aqi-usg"),
    (200, "Unhealthy", "aqi-unhealthy"),
    (300, "Very Unhealthy", "aqi-very-unhealthy"),
    (10 ** 9, "Hazardous", "aqi-hazardous"),
]


def aqi_category(us_aqi):
    """Return (category, css_class) for a US AQI value, or (None, None)."""
    if us_aqi is None:
        return None, None
    try:
        value = float(us_aqi)
    except (TypeError, ValueError):
        return None, None
    for limit, label, css in AQI_CATEGORIES:
        if value <= limit:
            return label, css
    return None, None


# ---------------------------------------------------------------------------
# UV index categories
# ---------------------------------------------------------------------------

def uv_category(uv):
    """Return a short risk label for a UV index value."""
    if uv is None:
        return None
    try:
        uv = float(uv)
    except (TypeError, ValueError):
        return None
    if uv < 3:
        return "Low"
    if uv < 6:
        return "Moderate"
    if uv < 8:
        return "High"
    if uv < 11:
        return "Very High"
    return "Extreme"


# ---------------------------------------------------------------------------
# Wind direction
# ---------------------------------------------------------------------------

def wind_compass(degrees):
    """Convert a wind direction in degrees to a 16-point compass label."""
    if degrees is None:
        return None
    try:
        degrees = float(degrees) % 360
    except (TypeError, ValueError):
        return None
    points = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ]
    return points[int((degrees + 11.25) // 22.5) % 16]


# ---------------------------------------------------------------------------
# Moon phase (computed, not fabricated: standard synodic approximation)
# ---------------------------------------------------------------------------

_MOON_PHASES = [
    (1.84566, "New Moon"),
    (5.53699, "Waxing Crescent"),
    (9.22831, "First Quarter"),
    (12.91963, "Waxing Gibbous"),
    (16.61096, "Full Moon"),
    (20.30228, "Waning Gibbous"),
    (23.99361, "Last Quarter"),
    (27.68493, "Waning Crescent"),
]


def moon_phase(when):
    """Return the moon phase name and illuminated fraction for a date.

    Uses the common synodic-month approximation anchored to a known new moon.
    """
    known_new_moon = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    days = (when - known_new_moon).total_seconds() / 86400.0
    lunation = 29.53058867
    age = days % lunation
    name = _MOON_PHASES[-1][1]
    for threshold, label in _MOON_PHASES:
        if age < threshold:
            name = label
            break
    illumination = round((1 - math.cos(2 * math.pi * age / lunation)) / 2 * 100)
    return name, illumination


# ---------------------------------------------------------------------------
# Rule-based intelligent summary (data-supported statements only)
# ---------------------------------------------------------------------------

def build_summary(current, daily_today, hourly):
    """Generate a short natural-language summary strictly from API data."""
    if not current:
        return None
    parts = []
    temp = current.get("temperature")
    code = current.get("weather_code")
    key, label = map_condition(code, current.get("is_day", True))
    humidity = current.get("humidity")

    # Time-of-day opener
    hour = datetime.now().hour
    if hour < 5:
        opener = "Early morning"
    elif hour < 12:
        opener = "Morning"
    elif hour < 17:
        opener = "Afternoon"
    elif hour < 21:
        opener = "Evening"
    else:
        opener = "Tonight"

    # Temperature feel (Celsius thresholds)
    if temp is not None:
        if temp >= 35:
            parts.append(f"{opener.lower()} is very hot at {round(temp)}°C")
        elif temp >= 28:
            parts.append(f"{opener.lower()} is warm at {round(temp)}°C")
        elif temp <= 0:
            parts.append(f"{opener.lower()} is freezing at {round(temp)}°C")
        elif temp <= 10:
            parts.append(f"{opener.lower()} is cold at {round(temp)}°C")
        else:
            parts.append(f"{opener.lower()} is mild at {round(temp)}°C")

    # Sky / precipitation outlook from the hourly data we actually have
    pop_max = max((h.get("pop") or 0) for h in (hourly or [])) if hourly else 0
    if key in ("storm",):
        parts.append("thunderstorms are in the area, stay indoors when possible")
    elif key in ("heavy-rain",):
        parts.append("heavy rainfall is falling — carry an umbrella")
    elif key in ("rain", "drizzle"):
        if pop_max >= 50:
            parts.append("showers are likely to continue, keep an umbrella handy")
        else:
            parts.append("light precipitation is falling")
    elif key == "snow":
        parts.append("snow is falling — expect slippery surfaces")
    elif key == "fog":
        parts.append("reduced visibility due to fog, drive carefully")
    elif pop_max >= 60 and daily_today:
        parts.append("rain is likely later in the day")
    elif key in ("clear", "clear-night"):
        parts.append("skies are mostly clear")
    elif key == "partly":
        parts.append("with partly cloudy skies")

    if humidity is not None:
        if humidity >= 80:
            parts.append("humidity is high")
        elif humidity <= 30:
            parts.append("the air is dry")
        else:
            parts.append("humidity is moderate")

    if daily_today and daily_today.get("uv_max") is not None:
        uv_label = uv_category(daily_today.get("uv_max"))
        try:
            uv_val = float(daily_today["uv_max"])
            if uv_val >= 8:
                parts.append(
                    f"very high UV is expected around midday — use sun protection"
                )
            elif uv_val >= 6:
                parts.append(f"UV index peaks at {round(uv_val)} (high) around midday")
        except (TypeError, ValueError):
            pass

    if not parts:
        return None
    sentence = parts[0].capitalize()
    if len(parts) > 1:
        sentence = parts[0].capitalize() + ", " + ", ".join(parts[1:])
    return sentence.rstrip(".") + "."
