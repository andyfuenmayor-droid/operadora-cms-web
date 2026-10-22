-- ==============================================================================
-- Migración 03: Bloqueo de Inmutabilidad de Snapshots de Cierre Semanal
-- Proyecto: Operadora CMS / Multibanca Express
-- Compatible con: Supabase (PostgREST) y PostgreSQL estándar (Docker / RDS / Local)
-- ==============================================================================

-- 1. Añadir columna is_locked con valor por defecto false (permite recálculos en Pre-Cierre)
ALTER TABLE IF EXISTS public.weekly_closure_snapshots
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- 2. Función Trigger: Prohibición absoluta de DELETE (un snapshot jamás se elimina)
CREATE OR REPLACE FUNCTION public.prevent_weekly_snapshot_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SNAPSHOT_DELETE_FORBIDDEN: Los snapshots de cierre semanal son inmutables y no pueden eliminarse (Semana: %).', OLD.semana_no;
END;
$$ LANGUAGE plpgsql;

-- 3. Función Trigger: Proteger snapshots sellados (is_locked = true) contra sobreescrituras
CREATE OR REPLACE FUNCTION public.protect_locked_weekly_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el snapshot anterior ya estaba sellado (is_locked = true), se rechaza cualquier modificación
    IF (OLD.is_locked = true AND (NEW.is_locked = true OR NEW.is_locked IS NULL)) THEN
        RAISE EXCEPTION 'SNAPSHOT_LOCKED: El cierre de la semana % está sellado definitivamente y bloqueado contra modificaciones.', OLD.semana_no;
    END IF;
    
    -- Actualizar timestamp
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Instalar Trigger para DELETE
DROP TRIGGER IF EXISTS trg_forbid_delete_weekly_snapshot ON public.weekly_closure_snapshots;
CREATE TRIGGER trg_forbid_delete_weekly_snapshot
BEFORE DELETE ON public.weekly_closure_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.prevent_weekly_snapshot_delete();

-- 5. Instalar Trigger para UPDATE
DROP TRIGGER IF EXISTS trg_protect_locked_weekly_snapshot ON public.weekly_closure_snapshots;
CREATE TRIGGER trg_protect_locked_weekly_snapshot
BEFORE UPDATE ON public.weekly_closure_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.protect_locked_weekly_snapshot();
