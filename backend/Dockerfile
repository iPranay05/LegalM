FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
        tesseract-ocr \
        libzbar0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Make the entrypoint executable
RUN chmod +x start.sh

EXPOSE 8000

# start.sh: runs migrations → seeds → starts celery worker → starts uvicorn
# Updated: force cache bust
CMD ["./start.sh"]
