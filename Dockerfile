FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --uid 10001 duet && mkdir /data /backups && chown duet /data /backups
COPY server.py config.json backup.py ./
COPY public ./public
ENV DUET_DATA=/data PYTHONUNBUFFERED=1
USER duet
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--worker-class", "gthread", "--threads", "4", "--timeout", "30", "--max-requests", "2000", "--max-requests-jitter", "100", "--access-logfile", "-", "server:application"]
