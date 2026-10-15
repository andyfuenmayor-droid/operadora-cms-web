#!/usr/bin/env bash
# ==============================================================================
# Script de Migración Automatizada: Supabase Cloud -> PostgreSQL Propio (Docker)
# Autor: Arquitecto Cloud & DBA PostgreSQL
# Proyecto: Operadora CMS / Multibanca Express
# ==============================================================================

set -euo pipefail

# Colores para mensajes de consola
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # Sin color

echo -e "${CYAN}====================================================================${NC}"
echo -e "${CYAN}   🚀 INICIANDO MIGRACIÓN AUTOMATIZADA: SUPABASE -> POSTGRESQL DOCKER ${NC}"
echo -e "${CYAN}====================================================================${NC}"

# 1. Cargar variables de entorno si existen (.env o .env.production)
ENV_FILE=""
if [ -f ".env.production" ]; then
    ENV_FILE=".env.production"
elif [ -f ".env" ]; then
    ENV_FILE=".env"
fi

if [ -n "$ENV_FILE" ]; then
    echo -e "${BLUE}ℹ️  Cargando configuración desde $ENV_FILE...${NC}"
    # Exportar variables sin comentar
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# 2. Obtener URI de Supabase
SUPABASE_URI="${1:-${SUPABASE_DB_URI:-${DATABASE_URL_SUPABASE:-}}}"

if [ -z "$SUPABASE_URI" ]; then
    echo -e "\n${YELLOW}⚠️  No se detectó la URI de conexión de Supabase en argumentos ni en el archivo .env.${NC}"
    read -r -p "👉 Pega aquí tu URI de Supabase (Session Pooler o Directa): " SUPABASE_URI
fi

if [ -z "$SUPABASE_URI" ]; then
    echo -e "${RED}❌ Error: Se requiere la URI de Supabase para continuar.${NC}"
    exit 1
fi

# Variables de destino de Postgres local en Docker
CONTAINER_NAME="operadora-postgres"
PG_USER="${POSTGRES_USER:-admin_db}"
PG_DB="${POSTGRES_DB:-operadora_production}"
DUMP_RAW="supabase_dump_raw.sql"
DUMP_CLEAN="supabase_dump_clean.sql"

echo -e "\n${BLUE}📋 Parámetros de Migración:${NC}"
echo -e "   • Contenedor destino: ${GREEN}$CONTAINER_NAME${NC}"
echo -e "   • Usuario Postgres:   ${GREEN}$PG_USER${NC}"
echo -e "   • Base de Datos:      ${GREEN}$PG_DB${NC}"
echo -e "   • Dump temporal:      ${GREEN}$DUMP_CLEAN${NC}"

# 3. Validar que Docker esté activo y el contenedor postgres esté en ejecución
echo -e "\n${BLUE}🔍 Verificando estado del contenedor $CONTAINER_NAME...${NC}"
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker no está en ejecución en este sistema.${NC}"
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
    echo -e "${YELLOW}⚠️  El contenedor $CONTAINER_NAME no está corriendo.${NC}"
    echo -e "${BLUE}▶️  Intentando iniciar la infraestructura con docker-compose...${NC}"
    docker compose up -d postgres
    echo -e "${BLUE}⏳ Esperando a que PostgreSQL esté completamente saludable (healthcheck)...${NC}"
    until [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null)" = "healthy" ]; do
        sleep 2
        echo -n "."
    done
    echo ""
fi
echo -e "${GREEN}✅ Contenedor $CONTAINER_NAME activo y respondiendo.${NC}"

# 4. PASO 1 de Migración: Extraer esquema public y datos usando contenedor efímero
echo -e "\n${CYAN}--------------------------------------------------------------------${NC}"
echo -e "${CYAN}📦 PASO 1/3: Extrayendo esquema public y datos desde Supabase...${NC}"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"
echo -e "${BLUE}Ejecutando pg_dump con postgres:17-alpine efímero para evitar server mismatch...${NC}"

# Usar flags estrictos solicitados: --schema=public --no-owner --no-privileges --clean --if-exists
docker run --rm \
    -v "$(pwd)":/workspace \
    postgres:17-alpine \
    pg_dump \
    --dbname="$SUPABASE_URI" \
    --schema=public \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --file="/workspace/$DUMP_RAW"

if [ ! -s "$DUMP_RAW" ]; then
    echo -e "${RED}❌ Error: El volcado de Supabase falló o generó un archivo vacío ($DUMP_RAW).${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Volcado completado exitosamente: $(du -h "$DUMP_RAW" | cut -f1)${NC}"

# 5. PASO 2 de Migración: Sanitizar y limpiar el dump SQL
echo -e "\n${CYAN}--------------------------------------------------------------------${NC}"
echo -e "${CYAN}🧹 PASO 2/3: Sanitizando el archivo SQL (eliminando roles y residuos de Supabase)...${NC}"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"

# Limpieza estricta de roles, schemas privativos y lineas de Supabase
sed -E \
    -e '/supabase_admin/d' \
    -e '/supabase_realtime/d' \
    -e '/pg_graphql/d' \
    -e '/anon/d' \
    -e '/authenticated/d' \
    -e '/service_role/d' \
    -e '/supabase_auth_admin/d' \
    -e '/supabase_storage_admin/d' \
    -e '/ALTER DEFAULT PRIVILEGES/d' \
    -e '/SET default_table_access_method/d' \
    -e '/CREATE EXTENSION IF NOT EXISTS.*graphql/d' \
    -e '/CREATE EXTENSION IF NOT EXISTS.*vault/d' \
    "$DUMP_RAW" > "$DUMP_CLEAN"

rm -f "$DUMP_RAW"
echo -e "${GREEN}✅ Archivo sanitizado listo: $DUMP_CLEAN${NC}"

# 6. PASO 3 de Migración: Importar el dump en el contenedor PostgreSQL
echo -e "\n${CYAN}--------------------------------------------------------------------${NC}"
echo -e "${CYAN}📥 PASO 3/3: Importando datos en el contenedor $CONTAINER_NAME...${NC}"
echo -e "${CYAN}--------------------------------------------------------------------${NC}"

# Importar asegurando que no se detenga ante avisos menores de DROP IF EXISTS
docker exec -i "$CONTAINER_NAME" psql -U "$PG_USER" -d "$PG_DB" < "$DUMP_CLEAN"

echo -e "${GREEN}✅ Importación completada satisfactoriamente.${NC}"

# 7. Verificación final y reporte de tablas
echo -e "\n${CYAN}====================================================================${NC}"
echo -e "${CYAN}📊 REPORTE DE VERIFICACIÓN POST-MIGRACIÓN${NC}"
echo -e "${CYAN}====================================================================${NC}"

docker exec -i "$CONTAINER_NAME" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "
SELECT 
    schemaname || '.' || relname AS tabla,
    n_live_tup AS registros_aproximados
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY relname;
" | while IFS='|' read -r tabla registros; do
    printf "   📋 %-35s 👉 %s filas\n" "$tabla" "$registros"
done

TOTAL_TABLAS=$(docker exec -i "$CONTAINER_NAME" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
")

echo -e "\n${GREEN}🎉 ¡MIGRACIÓN EXITOSA!${NC}"
echo -e "   Total de tablas públicas migradas a PostgreSQL: ${GREEN}$TOTAL_TABLAS${NC}"
echo -e "   El archivo de respaldo limpio se conservó en: ${CYAN}$DUMP_CLEAN${NC}"
echo -e "${CYAN}====================================================================${NC}"
