from django.urls import path

from . import views

app_name = "weather"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/weather/", views.api_weather, name="api-weather"),
    path("api/geocode/", views.api_geocode, name="api-geocode"),
    path("api/reverse/", views.api_reverse, name="api-reverse"),
]
