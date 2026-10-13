import { supabase } from '../lib/supabase';

export interface AuditLogEntry {
  id?: string;
  user_id: string;
  timestamp: string;
  usuario: string;
  modulo: 'AGENCIAS' | 'VENTAS' | 'PAGOS' | 'GASTOS' | 'SISTEMAS' | 'CIERRES' | 'AUDITORIA';
  tipo_accion: string;
  entidad_afectada: string;
  descripcion: string;
  impacto_financiero: 'ALTO' | 'MEDIO' | 'BAJO' | 'INFO';
  valor_anterior?: any;
  valor_nuevo?: any;
}

const LOCAL_STORAGE_KEY = 'cda_audit_logs_cache';
const CONFIG_PARAM_PREFIX = 'audit_log_item_';

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  const fullEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  // 1. Save to localStorage cache
  try {
    const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const existing: AuditLogEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
    existing.unshift(fullEntry);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing.slice(0, 300)));
  } catch (e) {
    console.warn('Could not save audit log to localStorage:', e);
  }

  // 2. Persist to Supabase config_sistema table (Durable storage without migrations)
  try {
    const paramKey = `${CONFIG_PARAM_PREFIX}${Date.now()}`;
    await supabase.from('config_sistema').insert({
      user_id: entry.user_id,
      parametro: paramKey,
      valor: JSON.stringify(fullEntry),
    });
  } catch (e) {
    console.warn('Could not persist audit log to config_sistema:', e);
  }
}

export async function fetchAuditLogs(effectiveUserId: string): Promise<AuditLogEntry[]> {
  const logs: AuditLogEntry[] = [];

  // Read from localStorage cache
  try {
    const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localRaw) {
      const parsed: AuditLogEntry[] = JSON.parse(localRaw);
      logs.push(...parsed);
    }
  } catch (e) {
    console.warn('Could not read audit logs from localStorage:', e);
  }

  // Read from Supabase config_sistema
  if (effectiveUserId) {
    try {
      const { data } = await supabase
        .from('config_sistema')
        .select('*')
        .eq('user_id', effectiveUserId)
        .like('parametro', `${CONFIG_PARAM_PREFIX}%`)
        .order('id', { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        data.forEach((item: any) => {
          try {
            const parsed = JSON.parse(item.valor);
            if (
              !logs.some(
                (l) =>
                  l.id === parsed.id ||
                  (l.timestamp === parsed.timestamp && l.descripcion === parsed.descripcion)
              )
            ) {
              logs.push(parsed);
            }
          } catch (err) {}
        });
      }
    } catch (e) {
      console.warn('Could not fetch audit logs from config_sistema:', e);
    }
  }

  // Sort descending by timestamp
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return logs;
}
