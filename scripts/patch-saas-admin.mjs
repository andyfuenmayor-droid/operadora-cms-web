import fs from 'fs';
import path from 'path';

const SAAS_DIR = 'C:/Users/andyf/Downloads/saas-administrador-web-main';

console.log('🔧 Aplicando parches precisos a SaaS Admin...');

// 1. Modificar tenantProvisioner.ts
const provPath = path.join(SAAS_DIR, 'src/utils/tenantProvisioner.ts');
let provContent = fs.readFileSync(provPath, 'utf8');

const newFetchCatalog = `export async function fetchDatabaseCatalog(): Promise<{
  currencies: { Nombre_Moneda: string; Simbolo: string }[];
  systems: string[];
}> {
  try {
    const currencyMap = new Map<string, { Nombre_Moneda: string; Simbolo: string }>();

    // 1. Obtener monedas del catálogo maestro global primero
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

    // Fallback a monedas operativas si estuviera vacío
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
    }`;

provContent = provContent.replace(
  /export async function fetchDatabaseCatalog[\s\S]*?if \(rawCurrencies && rawCurrencies\.length > 0\) \{[\s\S]*?\}\s*\}\s*\}/,
  newFetchCatalog
);

const newSysQuery = `    // 2. Obtener sistemas del catálogo maestro global primero
    const systemSet = new Set<string>();
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

    if (systemSet.size === 0) {
      const { data: rawSystems } = await supabase
        .from('sistemas')
        .select('nombre_sistema');

      if (rawSystems && rawSystems.length > 0) {
        rawSystems.forEach((s: any) => {
          const name = cleanName(s.nombre_sistema || '');
          if (name) {
            systemSet.add(name.toUpperCase());
          }
        });
      }
    }`;

provContent = provContent.replace(
  /\/\/\s*2\.\s*Obtener todos los sistemas[\s\S]*?if \(rawSystems && rawSystems\.length > 0\) \{[\s\S]*?\}\s*\}\s*\}/,
  newSysQuery
);

fs.writeFileSync(provPath, provContent, 'utf8');
console.log('✓ tenantProvisioner.ts parcheado con éxito');

// 2. Modificar App.tsx
const appPath = path.join(SAAS_DIR, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Agregar imports
if (!appContent.includes('MasterCatalogTab')) {
  appContent = appContent.replace(
    "import { FactoryReset } from './components/PlansTab/FactoryReset';",
    "import { FactoryReset } from './components/PlansTab/FactoryReset';\nimport { MasterCatalogTab } from './components/MasterCatalogTab/MasterCatalogTab';"
  );
}

if (!appContent.includes('Database')) {
  appContent = appContent.replace(
    "import { Users, Send, Clock, Settings2, RefreshCw, ExternalLink, Globe } from 'lucide-react';",
    "import { Users, Send, Clock, Settings2, RefreshCw, ExternalLink, Globe, Database } from 'lucide-react';"
  );
}

if (!appContent.includes('MasterSystem')) {
  appContent = appContent.replace(
    "import { ClientProfile, Lead, TrackingLead, CatalogPlans, PLANES_DEFAULT_DICT, TODOS_LOS_MODULOS_CMS } from './types';",
    "import { ClientProfile, Lead, TrackingLead, CatalogPlans, MasterSystem, MasterCurrency, PLANES_DEFAULT_DICT, TODOS_LOS_MODULOS_CMS } from './types';"
  );
}

// activeTab type
if (!appContent.includes("'master-catalog'")) {
  appContent = appContent.replace(
    "const [activeTab, setActiveTab] = useState<'clients' | 'leads' | 'tracking' | 'plans'>('clients');",
    "const [activeTab, setActiveTab] = useState<'clients' | 'leads' | 'tracking' | 'plans' | 'master-catalog'>('clients');"
  );
}

// Data states for master catalog
if (!appContent.includes('masterSystems')) {
  appContent = appContent.replace(
    "const [catalog, setCatalog] = useState<CatalogPlans>(PLANES_DEFAULT_DICT);",
    "const [catalog, setCatalog] = useState<CatalogPlans>(PLANES_DEFAULT_DICT);\n  const [masterSystems, setMasterSystems] = useState<MasterSystem[]>([]);\n  const [masterCurrencies, setMasterCurrencies] = useState<MasterCurrency[]>([]);"
  );
}

// In loadAllData
const masterFetchLogic = `      // 5. Catálogo Maestro de Sistemas Globales
      try {
        const { data: sysData, error: sysErr } = await supabase
          .from('catalogo_sistemas_maestro')
          .select('*')
          .order('nombre_sistema', { ascending: true });
        if (!sysErr && sysData) {
          setMasterSystems(sysData as MasterSystem[]);
        }
      } catch (err) {
        console.warn('Error cargando catalogo_sistemas_maestro:', err);
      }

      // 6. Catálogo Maestro de Monedas Globales
      try {
        const { data: curData, error: curErr } = await supabase
          .from('catalogo_monedas_maestro')
          .select('*')
          .order('es_base', { ascending: false });
        if (!curErr && curData) {
          setMasterCurrencies(curData as MasterCurrency[]);
        }
      } catch (err) {
        console.warn('Error cargando catalogo_monedas_maestro:', err);
      }`;

if (!appContent.includes('catalogo_sistemas_maestro')) {
  appContent = appContent.replace(
    /console\.error\('Error parseando planes_saas_catalogo:', e\);\s*\}\s*\}/,
    `console.error('Error parseando planes_saas_catalogo:', e);\n        }\n      }\n\n${masterFetchLogic}`
  );
}

// Handlers for master catalog
const masterHandlers = `  // Operaciones de Catálogo Maestro Global
  const handleSaveMasterSystem = async (sys: Partial<MasterSystem>): Promise<boolean> => {
    try {
      if (sys.id) {
        const { error } = await supabase
          .from('catalogo_sistemas_maestro')
          .update({
            nombre_sistema: sys.nombre_sistema,
            col_agencia: sys.col_agencia,
            col_venta: sys.col_venta,
            col_premio: sys.col_premio,
            descripcion: sys.descripcion,
            updated_at: new Date().toISOString()
          })
          .eq('id', sys.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catalogo_sistemas_maestro')
          .insert({
            nombre_sistema: sys.nombre_sistema,
            col_agencia: sys.col_agencia || 'Agencia',
            col_venta: sys.col_venta || 'Venta',
            col_premio: sys.col_premio || 'Premio',
            descripcion: sys.descripcion || null
          });
        if (error) throw error;
      }
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error guardando sistema maestro:', err);
      return false;
    }
  };

  const handleDeleteMasterSystem = async (sys: MasterSystem): Promise<boolean> => {
    try {
      if (!sys.id) return false;
      const { error } = await supabase
        .from('catalogo_sistemas_maestro')
        .delete()
        .eq('id', sys.id);
      if (error) throw error;
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error eliminando sistema maestro:', err);
      return false;
    }
  };

  const handleSaveMasterCurrency = async (cur: Partial<MasterCurrency>): Promise<boolean> => {
    try {
      if (cur.id) {
        const { error } = await supabase
          .from('catalogo_monedas_maestro')
          .update({
            codigo: cur.codigo,
            nombre: cur.nombre,
            simbolo: cur.simbolo,
            decimales: cur.decimales,
            es_base: cur.es_base,
            updated_at: new Date().toISOString()
          })
          .eq('id', cur.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catalogo_monedas_maestro')
          .insert({
            codigo: cur.codigo,
            nombre: cur.nombre,
            simbolo: cur.simbolo,
            decimales: cur.decimales ?? 2,
            es_base: cur.es_base ?? false
          });
        if (error) throw error;
      }
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error guardando moneda maestra:', err);
      return false;
    }
  };

  const handleDeleteMasterCurrency = async (cur: MasterCurrency): Promise<boolean> => {
    try {
      if (!cur.id) return false;
      const { error } = await supabase
        .from('catalogo_monedas_maestro')
        .delete()
        .eq('id', cur.id);
      if (error) throw error;
      await loadAllData();
      return true;
    } catch (err) {
      console.error('Error eliminando moneda maestra:', err);
      return false;
    }
  };`;

if (!appContent.includes('handleSaveMasterSystem')) {
  appContent = appContent.replace(
    /const handleResetToFactory = async \(\): Promise<boolean> => \{\s*return await saveCatalogToDb\(PLANES_DEFAULT_DICT\);\s*\};/,
    `const handleResetToFactory = async (): Promise<boolean> => {\n    return await saveCatalogToDb(PLANES_DEFAULT_DICT);\n  };\n\n${masterHandlers}`
  );
}

// Botón de pestaña en Tab Capsule
const tabButtonCode = `            <button
              onClick={() => setActiveTab('master-catalog')}
              className={\`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap \${
                activeTab === 'master-catalog'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }\`}
            >
              <Database className="w-4 h-4" />
              <span>Catálogo Global ({masterSystems.length + masterCurrencies.length})</span>
            </button>`;

if (!appContent.includes("activeTab === 'master-catalog'")) {
  appContent = appContent.replace(
    /<button\s*onClick=\{\(\) => setActiveTab\('plans'\)\}/,
    `${tabButtonCode}\n\n            <button\n              onClick={() => setActiveTab('plans')}`
  );
}

// Renderizado de la pestaña MasterCatalogTab
const tabRenderCode = `          {/* Tab 5: Catálogo Global Maestro */}
          {activeTab === 'master-catalog' && (
            <MasterCatalogTab
              systems={masterSystems}
              currencies={masterCurrencies}
              onSaveSystem={handleSaveMasterSystem}
              onDeleteSystem={handleDeleteMasterSystem}
              onSaveCurrency={handleSaveMasterCurrency}
              onDeleteCurrency={handleDeleteMasterCurrency}
            />
          )}`;

if (!appContent.includes('<MasterCatalogTab')) {
  appContent = appContent.replace(
    `              {/* 3. Factory Reset */}\n              <FactoryReset onResetToFactory={handleResetToFactory} />\n            </div>\n          )}`,
    `              {/* 3. Factory Reset */}\n              <FactoryReset onResetToFactory={handleResetToFactory} />\n            </div>\n          )}\n\n${tabRenderCode}`
  );
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('✓ App.tsx parcheado con éxito');
console.log('🎉 Parches completados con éxito');
