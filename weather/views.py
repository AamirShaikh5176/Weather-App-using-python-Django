"""Views: page rendering plus internal REST-style JSON endpoints.

Views validate all client input, delegate to the service layer, and return
friendly JSON errors — raw exception text is never exposed.
"""

import logging

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET

from . import services
from .services import WeatherServiceError

logger = logging.getLogger(__name__)


def index(request):
    return render(request, "weather/index.html")


def _parse_coord(value, name, low, high):
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {name}.")
    if not (low <= num <= high):
        raise ValueError(f"Invalid {name}.")
    return round(num, 4)


def _error(message, status=400):
    return JsonResponse({"error": message}, status=status)


@require_GET
def api_geocode(request):
    """Location suggestions for the search box. Debounced client-side."""
    query = (request.GET.get("q") or "").strip()
    if len(query) < 2:
        return JsonResponse({"results": []})
    try:
        results = services.geocode(query)
    except WeatherServiceError as exc:
        return _error(str(exc), status=502)
    except Exception:
        logger.exception("geocode failed")
        return _error("Search is temporarily unavailable. Please try again.", status=502)
    return JsonResponse({"results": results})


@require_GET
def api_reverse(request):
    """Reverse geocode coordinates for the 'use my location' button."""
    try:
        lat = _parse_coord(request.GET.get("lat"), "latitude", -90, 90)
        lon = _parse_coord(request.GET.get("lon"), "longitude", -180, 180)
    except ValueError as exc:
        return _error(str(exc))
    try:
        place = services.reverse_geocode(lat, lon)
    except WeatherServiceError as exc:
        return _error(str(exc), status=502)
    except Exception:
        logger.exception("reverse geocode failed")
        return _error("Could not resolve your location. Please try a search instead.", status=502)
    return JsonResponse({"place": place})


@require_GET
def api_weather(request):
    """Full weather payload for coordinates, or for a free-text place query."""
    query = (request.GET.get("q") or "").strip()
    place = None
    try:
        if query:
            results = services.geocode(query, count=1)
            if not results:
                return _error(
                    "We couldn't find that location. Please check the spelling or try another city."
                )
            match = results[0]
            lat, lon = match["lat"], match["lon"]
            place = match
        else:
            lat = _parse_coord(request.GET.get("lat"), "latitude", -90, 90)
            lon = _parse_coord(request.GET.get("lon"), "longitude", -180, 180)
            name = (request.GET.get("name") or "").strip()
            if name:
                # Client-supplied display name for coordinate lookups (e.g.
                # geolocation). Treated as display metadata only, never trusted
                # for data.
                place = {
                    "name": name[:100],
                    "admin1": (request.GET.get("admin1") or "")[:100],
                    "country": (request.GET.get("country") or "")[:100],
                    "country_code": "",
                    "lat": lat,
                    "lon": lon,
                }
    except ValueError as exc:
        return _error(str(exc))
    except WeatherServiceError as exc:
        return _error(str(exc), status=502)

    try:
        payload = services.fetch_weather(lat, lon, place=place, force=request.GET.get("fresh") == "1")
    except WeatherServiceError as exc:
        return _error(str(exc), status=502)
    except Exception:
        logger.exception("weather fetch failed for %s,%s", lat, lon)
        return _error("Weather data is temporarily unavailable. Please try again.", status=502)
    return JsonResponse(payload)
