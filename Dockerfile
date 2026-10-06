# AtmosWeather — production container (linux/arm64 compatible)
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Build dependencies only needed for compilation go here if any appear
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect static files for WhiteNoise compressed serving
RUN python manage.py collectstatic --noinput

ENV DJANGO_DEBUG=False \
    DJANGO_ALLOWED_HOSTS=* \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:${PORT}/ >/dev/null || exit 1

CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2 --threads 4"]
