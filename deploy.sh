#!/bin/bash
# Script de despliegue automatizado para crm.multibancaexpress.com en DigitalOcean Droplet
# Uso: bash deploy.sh

set -e

PORT=8530
DOMAIN="crm.multibancaexpress.com"

echo "🚀 Iniciando despliegue de Operadora CMS Web ($DOMAIN)..."
systemctl enable --now docker || true
systemctl enable --now nginx || true

echo "📦 Construyendo la imagen de Docker para operadora-cms-web..."
docker build -t operadora-cms-web-app .

echo "🛑 Deteniendo y limpiando contenedor anterior..."
docker rm -f operadora-cms-web-container 2>/dev/null || true
sleep 2

echo "▶️ Iniciando nuevo contenedor en puerto dedicado $PORT..."
docker run -d \
  --name operadora-cms-web-container \
  -p 127.0.0.1:$PORT:80 \
  --restart always \
  operadora-cms-web-app

echo "⚙️ Configurando Nginx para $DOMAIN..."
rm -f /etc/nginx/sites-enabled/crm
rm -f /etc/nginx/sites-available/crm

cat << EOF > /etc/nginx/sites-available/crm
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

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

    location /assets/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
nginx -t
systemctl reload nginx

echo "🔒 Verificando/Aplicando Certificado SSL para $DOMAIN..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email || echo "⚠️ Certbot finalizado."

nginx -t
systemctl reload nginx

echo "✅ Despliegue de Operadora CMS Web completado con éxito en https://$DOMAIN"
