#!/usr/bin/env bash
# Supervisiona o download ate completar (religando o curl quantas vezes precisar)
# e entao roda o pipeline. O download ja caiu uma vez em silencio; aqui nao cai.
set -u
cd /home/msoares/projetos/insights-spotfy-grupo-4
ESPERADO=7480013679
CA=/home/msoares/zscaler-bundle.pem
U="https://data.metabrainz.org/pub/musicbrainz/data/fullexport/20260829-002439/mbdump.tar.bz2"
ARQ=data/musicbrainz/mbdump.tar.bz2

for tentativa in $(seq 1 40); do
  while pgrep -f "curl .*$ARQ" > /dev/null; do sleep 20; done
  ATUAL=$(stat -c %s "$ARQ" 2>/dev/null || echo 0)
  if [ "$ATUAL" -ge "$ESPERADO" ]; then
    echo "[$(date +%H:%M:%S)] download completo: $ATUAL bytes"
    break
  fi
  PCT=$(( ATUAL * 100 / ESPERADO ))
  echo "[$(date +%H:%M:%S)] tentativa $tentativa: em ${PCT}% ($ATUAL bytes), religando curl"
  curl -sS --cacert "$CA" -C - --retry 20 --retry-delay 10 --retry-all-errors \
       --speed-time 120 --speed-limit 10000 -o "$ARQ" "$U" || true
done

ATUAL=$(stat -c %s "$ARQ" 2>/dev/null || echo 0)
if [ "$ATUAL" -ne "$ESPERADO" ]; then
  echo "!! desisti: $ATUAL de $ESPERADO bytes"; exit 1
fi
echo "[$(date +%H:%M:%S)] iniciando pipeline"
exec .venv/bin/python -u scripts/enriquecer_musicbrainz.py --memoria 6GB
