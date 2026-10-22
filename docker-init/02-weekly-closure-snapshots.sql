-- ==============================================================================
-- Tabla de Snapshot Total de Pre-Cierres y Cierres Semanales
-- Proyecto: Operadora CMS / Multibanca Express
-- Compatible con: Supabase (PostgREST) y PostgreSQL estándar (Docker / RDS / Local)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.weekly_closure_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    semana_no TEXT NOT NULL,
    periodo TEXT NOT NULL,
    fecha_cierre TIMESTAMPTZ DEFAULT NOW(),
    
    -- Cargas detalladas de ventas de la semana (ventas brutas, comisiones, premios, neto, utilidades)
    raw_sales_loads JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Balances consolidados por caja (BS, USD, COP)
    consolidated_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Las 24 filas exactas de la Matriz de Arqueo por Caja y Agencia
    agency_matrix JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Las 8 filas de liquidación de Casas Operadoras
    operator_matrix JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Detalle exhaustivo de movimientos auditados (bancos, efectivo, cobradores, gastos, confirmaciones)
    all_movements JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Saldos finales auditados que pasan como Arrastre Inicial a la siguiente semana
    carry_over_balances JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Hash criptográfico SHA-256 para validación de integridad inmutable
    integrity_hash TEXT NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_weekly_closure_snapshot UNIQUE (user_id, semana_no)
);

CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_user_sem ON public.weekly_closure_snapshots(user_id, semana_no);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_created_at ON public.weekly_closure_snapshots(created_at DESC);

-- Habilitar RLS si se ejecuta en Supabase
ALTER TABLE IF EXISTS public.weekly_closure_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'weekly_closure_snapshots' AND policyname = 'weekly_snapshots_allow_all'
    ) THEN
        CREATE POLICY weekly_snapshots_allow_all ON public.weekly_closure_snapshots
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
