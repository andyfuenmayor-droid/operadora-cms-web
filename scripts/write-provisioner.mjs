import fs from 'fs';

const target = 'C:/Users/andyf/Downloads/saas-administrador-web-main/src/utils/tenantProvisioner.ts';
const content = `import { supabase } from '../lib/supabase';

export interface ProvisioningResult {
  success: boolean;
  currenciesCount: number;
  systemsCount: number;
  agencyId: number | null;
  agencyName: string;
  taquillaUser: string;
  taquillaPass: string;
  error?: string;
}

function cleanName(str: string): string {
  return (str || '').trim();
}

export async function fetchDatabaseCatalog(): Promise<{
  currencies: { Nombre_Moneda: string; Simbolo: string }[];
  systems: string[];
}> {
  try {
    const currencyMap = new Map<string, { Nombre_Moneda: string; Simbolo: string }>();
    const systemSet = new Set<string>();

    // 1. Monedas desde catálogo maestro global
    try {
      const { data: masterCurrencies } = await supabase
        .from('catalogo_monedas_maestro')
        .select('codigo, nombre, simbolo')
        .order('es_base', { ascending: false });

      if (masterCurrencies && masterCurrencies.length > 0) {
        masterCurrencies.forEach((c: any) => {
          const code = cleanName(c.codigo || c.nombre || '');
          const symbol = cleanName(c.simbolo || code);
          if (code && !currencyMap.has(code.toUpperCase())) {
            currencyMap.set(code.toUpperCase(), { Nombre_Moneda: code, Simbolo: symbol });
          }
        });
      }
    } catch (_) {}

    // Fallback de monedas operativas si estuviera vacío
    if (currencyMap.size === 0) {
      const { data: rawCurrencies } = await supabase
        .from('monedas')
        .select('Nombre_Moneda, Simbolo');

      if (rawCurrencies && rawCurrencies.length > 0) {
        rawCurrencies.forEach((c: any) => {
          const name = cleanName(c.Nombre_Moneda || c.nombre_moneda || '');
          const symbol = cleanName(c.Simbolo || c.simbolo || name);
          if (name) {
            const key = name.toUpperCase();
            if (!currencyMap.has(key)) {
              currencyMap.set(key, { Nombre_Moneda: name, Simbolo: symbol });
            }
          }
        });
      }
    }

    // Fallback de seguridad
    if (currencyMap.size === 0) {
      currencyMap.set('BS', { Nombre_Moneda: 'Bs', Simbolo: 'Bs' });
      currencyMap.set('USD', { Nombre_Moneda: 'USD', Simbolo: '$' });
      currencyMap.set('COP', { Nombre_Moneda: 'COP', Simbolo: 'COP' });
    }

    // 2. Sistemas desde catálogo maestro global
    try {
      const { data: masterSystems } = await supabase
        .from('catalogo_sistemas_maestro')
        .select('nombre_sistema')
        .order('nombre_sistema', { ascending: true });

      if (masterSystems && masterSystems.length > 0) {
        masterSystems.forEach((s: any) => {
          const name = cleanName(s.nombre_sistema || '');
          if (name) systemSet.add(name.toUpperCase());
        });
      }
    } catch (_) {}

    // Fallback de sistemas operativos
    if (systemSet.size === 0) {
      const { data: rawSystems } = await supabase
        .from('sistemas')
        .select('nombre_sistema');

      if (rawSystems && rawSystems.length > 0) {
        rawSystems.forEach((s: any) => {
          const name = cleanName(s.nombre_sistema || '');
          if (name) systemSet.add(name.toUpperCase());
        });
      }
    }

    // Fallback de seguridad si no hubiera ninguno
    if (systemSet.size === 0) {
      ['BETM3', 'CDAPUESTAS', 'GATOWEB', 'KENO', 'BETF4', 'GATO PESOS'].forEach((s) =>
        systemSet.add(s)
      );
    }

    return {
      currencies: Array.from(currencyMap.values()),
      systems: Array.from(systemSet.values()),
    };
  } catch (err) {
    console.warn('Error extrayendo catálogo dinámico de la BD, usando predeterminados:', err);
    return {
      currencies: [
        { Nombre_Moneda: 'Bs', Simbolo: 'Bs' },
        { Nombre_Moneda: 'USD', Simbolo: '$' },
        { Nombre_Moneda: 'COP', Simbolo: 'COP' },
      ],
      systems: ['BETM3', 'CDAPUESTAS', 'GATOWEB', 'KENO', 'BETF4', 'GATO PESOS'],
    };
  }
}

export async function provisionTenantFromDatabase(
  userId: string,
  bancaName: string
): Promise<ProvisioningResult> {
  const result: ProvisioningResult = {
    success: false,
    currenciesCount: 0,
    systemsCount: 0,
    agencyId: null,
    agencyName: 'AGENCIA 01 - DEMO',
    taquillaUser: 'taquilla1',
    taquillaPass: '123456',
  };

  if (!userId) {
    result.error = 'No se proporcionó un ID de usuario válido';
    return result;
  }

  try {
    const { currencies, systems } = await fetchDatabaseCatalog();

    const currenciesPayload = currencies.map((c) => ({
      Nombre_Moneda: c.Nombre_Moneda,
      Simbolo: c.Simbolo,
      user_id: userId,
    }));

    const { error: currErr } = await supabase.from('monedas').insert(currenciesPayload);
    if (!currErr) {
      result.currenciesCount = currenciesPayload.length;
    } else {
      console.error('Error insertando monedas para el tenant:', currErr);
    }

    const systemsPayload = systems.map((sys) => ({
      nombre_sistema: sys,
      user_id: userId,
    }));

    const { error: sysErr } = await supabase.from('sistemas').insert(systemsPayload);
    if (!sysErr) {
      result.systemsCount = systemsPayload.length;
    } else {
      console.error('Error insertando sistemas para el tenant:', sysErr);
    }

    const safeBancaSlug = (bancaName || 'banca')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    const taquillaUser = 'taq_' + (safeBancaSlug || 'demo');
    const taquillaPass = '123456';
    const agencyName = 'AGENCIA 01 - DEMO';

    result.taquillaUser = taquillaUser;
    result.taquillaPass = taquillaPass;
    result.agencyName = agencyName;

    const currencyNames = currencies.map((c) => c.Nombre_Moneda);
    const condicionesSistemas: Record<string, any> = {};

    systems.forEach((sys) => {
      currencyNames.forEach((mon) => {
        const comboKey = sys + '_' + mon;
        condicionesSistemas[comboKey] = {
          sistema: sys,
          moneda: mon,
          codigo: agencyName,
          comision: 15,
          participacion: 0,
        };
      });
      condicionesSistemas[sys] = {
        sistema: sys,
        codigo: agencyName,
        comision: 15,
      };
    });

    const agencyPayload = {
      nombre_agencia: agencyName,
      sistemas: systems.join(', '),
      monedas: currencyNames.join(', '),
      comision: 15,
      participacion_ag: 0,
      saldo_inicial_bs: 0,
      saldo_inicial_usd: 0,
      saldo_inicial_cop: 0,
      Saldo_BS: 0,
      Saldo_USD: 0,
      Saldo_COP: 0,
      auditoria_activa: true,
      cuentas_asignadas: 'NINGUNA',
      usuario_taquilla: taquillaUser,
      clave_taquilla: taquillaPass,
      condiciones_sistemas: JSON.stringify(condicionesSistemas),
      user_id: userId,
    };

    const { data: agencyData, error: agErr } = await supabase
      .from('agencias')
      .insert(agencyPayload)
      .select('id')
      .single();

    if (agErr) {
      console.error('Error creando agencia demo:', agErr);
    } else if (agencyData) {
      result.agencyId = agencyData.id;

      const cashierPayload = {
        user_id: userId,
        agencia_id: agencyData.id,
        usuario: taquillaUser,
        clave: taquillaPass,
        nombre_cajero: 'Cajero Demo 01',
        rol: 'cajero',
        activo: true,
      };

      const { error: cashierErr } = await supabase
        .from('taquilla_usuarios')
        .insert(cashierPayload);

      if (cashierErr) {
        console.error('Error creando usuario taquilla demo:', cashierErr);
      }
    }

    result.success = true;
    return result;
  } catch (err: any) {
    console.error('Error general en aprovisionamiento dinámico:', err);
    result.error = err?.message || 'Error desconocido';
    return result;
  }
}
`;

fs.writeFileSync(target, content, 'utf8');
console.log('✓ tenantProvisioner.ts escrito exitosamente');
