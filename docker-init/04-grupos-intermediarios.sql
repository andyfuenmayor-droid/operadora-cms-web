-- ==============================================================================
-- Migración 04: Grupos (Intermediarios / Sub-Comercializadores)
-- Proyecto: Operadora CMS / Multibanca Express
-- Compatible con: Supabase (PostgREST / RLS) y PostgreSQL estándar (Docker / RDS / Local)
-- ==============================================================================

-- 1. Crear tabla de Grupos / Sub-Comercializadores
CREATE TABLE IF NOT EXISTS public.grupos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    nombre_grupo TEXT NOT NULL,
    codigo TEXT,
    responsable TEXT,
    telefono TEXT,
    email_acceso TEXT,
    password_acceso TEXT,
    monedas TEXT NOT NULL DEFAULT 'BS,USD,COP',
    comision_pct_default NUMERIC(5,2) NOT NULL DEFAULT 0,
    participacion_pct_default NUMERIC(5,2) NOT NULL DEFAULT 0,
    condiciones_sistemas JSONB NOT NULL DEFAULT '{}'::jsonb,
    saldo_inicial_bs NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldo_inicial_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldo_inicial_cop NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldos_iniciales_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_nombre_grupo UNIQUE (user_id, nombre_grupo)
);

CREATE INDEX IF NOT EXISTS idx_grupos_user_id ON public.grupos(user_id);
CREATE INDEX IF NOT EXISTS idx_grupos_activo ON public.grupos(activo);

-- 2. Añadir columnas de árbol y saldos extendidos a la tabla Agencias
ALTER TABLE IF EXISTS public.agencias
ADD COLUMN IF NOT EXISTS grupo_id BIGINT,
ADD COLUMN IF NOT EXISTS grupo_nombre TEXT,
ADD COLUMN IF NOT EXISTS saldos_iniciales_json JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agencias_grupo_id ON public.agencias(grupo_id);
CREATE INDEX IF NOT EXISTS idx_agencias_grupo_nombre ON public.agencias(grupo_nombre);

-- 3. Crear tabla de Pagos / Liquidaciones de Grupos (entre Comercializador y Grupo)
CREATE TABLE IF NOT EXISTS public.pagos_grupos (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    grupo_id BIGINT,
    grupo_nombre TEXT NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    moneda TEXT NOT NULL DEFAULT 'BS',
    monto NUMERIC(15,2) NOT NULL DEFAULT 0,
    tipo_pago TEXT NOT NULL DEFAULT 'LIQUIDACION_GRUPO',
    metodo TEXT,
    banco TEXT,
    referencia TEXT,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_grupos_user_id ON public.pagos_grupos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_grupos_grupo_id ON public.pagos_grupos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_pagos_grupos_fecha ON public.pagos_grupos(fecha);

-- 4. Añadir group_matrix al snapshot semanal total
ALTER TABLE IF EXISTS public.weekly_closure_snapshots
ADD COLUMN IF NOT EXISTS group_matrix JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 5. Habilitar RLS y políticas permisivas seguras
ALTER TABLE IF EXISTS public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pagos_grupos ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'grupos' AND policyname = 'grupos_allow_all'
    ) THEN
        CREATE POLICY grupos_allow_all ON public.grupos
            FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'pagos_grupos' AND policyname = 'pagos_grupos_allow_all'
    ) THEN
        CREATE POLICY pagos_grupos_allow_all ON public.pagos_grupos
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
