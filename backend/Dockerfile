# syntax=docker/dockerfile:1
FROM python:3.12-slim

# Keeps Python from writing .pyc files and buffers stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (separate layer for better cache reuse)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Cloud Run injects the PORT env var (default 8080)
ENV PORT=8080

# Use exec form so signals are forwarded to uvicorn (clean shutdown)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
