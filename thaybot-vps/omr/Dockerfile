FROM python:3.12-slim
RUN pip install --no-cache-dir flask opencv-python-headless numpy
WORKDIR /app
COPY app.py .
EXPOSE 8002
CMD ["python3", "app.py"]
