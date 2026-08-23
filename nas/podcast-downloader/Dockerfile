FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

ENV DOWNLOAD_DIR=/downloads
ENV BIND_HOST=0.0.0.0
ENV BIND_PORT=8091
ENV AUTH_TOKEN=

EXPOSE 8091
CMD ["python", "app.py"]
