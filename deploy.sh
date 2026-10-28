#!/bin/bash
# Script de despliegue automatizado para crm.multibancaexpress.com en DigitalOcean Droplet
# Uso: bash deploy.sh

set -e

PORT=8530
API_PORT=8531
DOMAIN="crm.multibancaexpress.com"

echo "🚀 Iniciando despliegue de Operadora CMS Web + Backend + Web Service ($DOMAIN)..."
systemctl enable --now docker || true
systemctl enable --now nginx || true

# Limpieza de contenedor huérfano anterior si existiera fuera de Docker Compose
docker rm -f operadora-cms-web-container 2>/dev/null || true

# Asegurar archivo de variables de entorno .env
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo "📄 Creando .env desde .env.production..."
    cp .env.production .env
  elif [ -f .env.example ]; then
    echo "⚠️ Creando .env desde .env.example..."
    cp .env.example .env
  fi
fi

echo "📦 Construyendo y levantando servicios con Docker Compose (postgres, postgrest, api, web)..."
docker compose up -d --build postgres postgrest api web

echo "🧹 Limpiando imágenes residuales de Docker..."
docker image prune -f || true

echo "⚙️ Configurando Nginx para $DOMAIN..."
SITE_NAME="crm"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

SSL_OPTS=""
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] && SSL_OPTS="    include /etc/letsencrypt/options-ssl-nginx.conf;"
SSL_DH=""
[ -f /etc/letsencrypt/ssl-dhparams.pem ] && SSL_DH="    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
    echo "🔒 Certificados SSL detectados en $CERT_DIR. Configurando HTTPS..."
    cat << EOF > /etc/nginx/sites-available/$SITE_NAME
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;
    client_max_body_size 20M;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
$SSL_OPTS
$SSL_DH

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
    }

    location /rest/v1/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60;
    }

    location /realtime/v1/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    location /assets/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF
fi

ln -sf /etc/nginx/sites-available/$SITE_NAME /etc/nginx/sites-enabled/$SITE_NAME
nginx -t
systemctl reload nginx

echo "🔍 Verificando salud de los servicios..."
sleep 2
curl -fsS http://127.0.0.1:$API_PORT/api/v1/health || echo "⚠️ Advertencia: API healthcheck no respondió en loopback"
curl -fsS http://127.0.0.1:$PORT > /dev/null && echo "✅ Frontend web Nginx respondiendo correctamente" || echo "⚠️ Advertencia: Web frontend no respondió en loopback"

echo "✅ Despliegue de Operadora CMS Web completado con éxito en https://$DOMAIN"
