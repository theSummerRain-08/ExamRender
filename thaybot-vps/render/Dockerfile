FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base texlive-pictures texlive-latex-extra \
    texlive-lang-other asymptote poppler-utils \
    python3 python3-pip ghostscript \
 && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages flask
WORKDIR /app
COPY app.py .
EXPOSE 8001
CMD ["python3", "app.py"]
