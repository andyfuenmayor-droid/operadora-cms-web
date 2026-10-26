-- ==============================================================================
-- MIGRACIÓN 05: Catálogos Maestros Globales y Control de Estado (Activo/Oculto)
-- Proyecto: Operadora CMS / Multibanca Express
-- Compatible con:
--   1. PostgreSQL en DigitalOcean (Managed Database o Docker Droplet)
--   2. Supabase SQL Editor / PostgREST
-- ==============================================================================
--
-- INSTRUCCIONES DE EJECUCIÓN:
-- 
-- Opción A (Supabase SQL Editor):
--   Copia todo el contenido de este archivo y pégalo en el SQL Editor de Supabase, luego pulsa 'Run'.
--
-- Opción B (DigitalOcean Cloud Console / psql terminal):
--   psql -h <HOST> -p <PORT> -U <USUARIO> -d <DATABASE> -f MIGRATION_05_CATALOGOS_MAESTROS.sql
--
-- Opción C (Script automatizado Node.js):
--   node scripts/apply-migration-05.mjs "postgresql://usuario:clave@host:25060/db?sslmode=require"
-- ==============================================================================

-- 1. TABLA PADRE GLOBAL DE SISTEMAS / PROVEEDORES
CREATE TABLE IF NOT EXISTS public.catalogo_sistemas_maestro (
    id BIGSERIAL PRIMARY KEY,
    nombre_sistema TEXT NOT NULL UNIQUE,
    col_agencia TEXT NOT NULL DEFAULT 'Agencia',
    col_venta TEXT NOT NULL DEFAULT 'Venta',
    col_premio TEXT NOT NULL DEFAULT 'Premio',
    descripcion TEXT,
    icono TEXT,
    creado_por_user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_sistemas_nombre ON public.catalogo_sistemas_maestro(nombre_sistema);

-- 2. TABLA PADRE GLOBAL DE MONEDAS
CREATE TABLE IF NOT EXISTS public.catalogo_monedas_maestro (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    simbolo TEXT NOT NULL,
    decimales INT NOT NULL DEFAULT 2,
    es_base BOOLEAN NOT NULL DEFAULT false,
    icono TEXT,
    creado_por_user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_monedas_codigo ON public.catalogo_monedas_maestro(codigo);

-- 3. EVOLUCIÓN Y GARANTÍA DE TABLAS OPERATIVAS POR SUSCRIPTOR (Tenant user_id)
-- Crear tabla si es instalación nueva o asegurar que exista
CREATE TABLE IF NOT EXISTS public.sistemas (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    nombre_sistema TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    col_agencia TEXT DEFAULT 'Agencia',
    col_venta TEXT DEFAULT 'Venta',
    col_premio TEXT DEFAULT 'Premio',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_sistema UNIQUE (user_id, nombre_sistema)
);

-- Asegurar columnas en bases de datos con SaaS activos existentes (Cero Downtime, Cero Regresión)
ALTER TABLE IF EXISTS public.sistemas
ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS col_agencia TEXT DEFAULT 'Agencia',
ADD COLUMN IF NOT EXISTS col_venta TEXT DEFAULT 'Venta',
ADD COLUMN IF NOT EXISTS col_premio TEXT DEFAULT 'Premio',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sistemas_user_activo ON public.sistemas(user_id, activo);

-- Tabla de monedas por suscriptor
CREATE TABLE IF NOT EXISTS public.monedas (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    "Nombre_Moneda" TEXT NOT NULL,
    "Simbolo" TEXT NOT NULL,
    decimales INT NOT NULL DEFAULT 2,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.monedas
ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS decimales INT NOT NULL DEFAULT 2;

CREATE INDEX IF NOT EXISTS idx_monedas_user_activo ON public.monedas(user_id, activo);

-- 4. POBLAR DATOS SEMILLA EN LAS TABLAS PADRES (Idempotente: ON CONFLICT DO NOTHING)
INSERT INTO public.catalogo_sistemas_maestro (nombre_sistema, col_agencia, col_venta, col_premio, descripcion)
VALUES 
    ('BETM3', 'Nombre', 'Venta', 'Premio', 'Apuestas deportivas BetM3'),
    ('KENO', 'Agent', 'Total accepted', 'Total paid', 'Keno internacional'),
    ('CDAPUESTAS', 'Agencia', 'Venta', 'Premio', 'Loterías y jugadas CDA'),
    ('GATOWEB', 'USUARIO', 'VENTAS', 'PREMIOS', 'Plataforma GatoWeb'),
    ('GATO PESOS', 'Agencia', 'VENTA', 'PREMIOS', 'GatoWeb en Pesos Colombianos'),
    ('HIPISMO', 'Agencia', 'Ventas', 'Premios', 'Carreras hípicas nacionales e internacionales'),
    ('PARLEY', 'Agencia', 'Venta', 'Premio', 'Parley tradicional'),
    ('LOTERIAS', 'Agencia', 'Venta', 'Premio', 'Loterías de terminales')
ON CONFLICT (nombre_sistema) DO NOTHING;

INSERT INTO public.catalogo_monedas_maestro (codigo, nombre, simbolo, decimales, es_base)
VALUES 
    ('BS', 'Bolívares', 'Bs.', 2, true),
    ('USD', 'Dólares Americanos', '$', 2, true),
    ('COP', 'Pesos Colombianos', 'COP$', 0, true),
    ('EUR', 'Euros', '€', 2, false),
    ('USDT', 'Tether USD', '₮', 2, false),
    ('BRL', 'Reales Brasileños', 'R$', 2, false)
ON CONFLICT (codigo) DO NOTHING;

-- 5. POLÍTICAS DE ACCESO RLS (Compatible con Supabase y PostgreSQL DigitalOcean)
ALTER TABLE IF EXISTS public.catalogo_sistemas_maestro ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.catalogo_monedas_maestro ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Catálogo Sistemas Maestro: Políticas globales de lectura y retroalimentación
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalogo_sistemas_maestro' AND policyname = 'cat_sistemas_read_all') THEN
        CREATE POLICY cat_sistemas_read_all ON public.catalogo_sistemas_maestro FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalogo_sistemas_maestro' AND policyname = 'cat_sistemas_insert_all') THEN
        CREATE POLICY cat_sistemas_insert_all ON public.catalogo_sistemas_maestro FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalogo_sistemas_maestro' AND policyname = 'cat_sistemas_update_all') THEN
        CREATE POLICY cat_sistemas_update_all ON public.catalogo_sistemas_maestro FOR UPDATE USING (true) WITH CHECK (true);
    END IF;

    -- Catálogo Monedas Maestro: Políticas globales de lectura y retroalimentación
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalogo_monedas_maestro' AND policyname = 'cat_monedas_read_all') THEN
        CREATE POLICY cat_monedas_read_all ON public.catalogo_monedas_maestro FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalogo_monedas_maestro' AND policyname = 'cat_monedas_insert_all') THEN
        CREATE POLICY cat_monedas_insert_all ON public.catalogo_monedas_maestro FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalogo_monedas_maestro' AND policyname = 'cat_monedas_update_all') THEN
        CREATE POLICY cat_monedas_update_all ON public.catalogo_monedas_maestro FOR UPDATE USING (true) WITH CHECK (true);
    END IF;
END $$;
