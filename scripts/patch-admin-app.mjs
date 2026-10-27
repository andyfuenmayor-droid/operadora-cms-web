import fs from 'fs';

const appPath = 'C:/Users/Edgar Office/Downloads/saas-administrador-web-main/saas-administrador-web-main/src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// 1. Add imports if not present
if (!content.includes('SystemTesterTab')) {
  content = content.replace(
    "import { CurrenciesMasterTab } from './components/MasterCatalogTab/CurrenciesMasterTab';",
    "import { CurrenciesMasterTab } from './components/MasterCatalogTab/CurrenciesMasterTab';\nimport { SystemTesterTab } from './components/MasterCatalogTab/SystemTesterTab';"
  );
}

if (!content.includes('FlaskConical')) {
  content = content.replace(
    "import { Users, Send, Clock, Settings2, RefreshCw, ExternalLink, Globe, Layers, Coins } from 'lucide-react';",
    "import { Users, Send, Clock, Settings2, RefreshCw, ExternalLink, Globe, Layers, Coins, FlaskConical } from 'lucide-react';"
  );
}

// 2. Add 'tester' to activeTab type
content = content.replace(
  "<'clients' | 'leads' | 'tracking' | 'plans' | 'systems' | 'currencies'>",
  "<'clients' | 'leads' | 'tracking' | 'plans' | 'systems' | 'currencies' | 'tester'>"
);

// 3. Add tab button
const testerButton = `            <button
              onClick={() => setActiveTab('tester')}
              className={\`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap \${
                activeTab === 'tester'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }\`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>🧪 Lab de Reportes</span>
            </button>`;

if (!content.includes("setActiveTab('tester')")) {
  content = content.replace(
    "<span>Catálogo Monedas ({masterCurrencies.length})</span>\n            </button>",
    "<span>Catálogo Monedas ({masterCurrencies.length})</span>\n            </button>\n\n" + testerButton
  );
  // Also check if utf8 encoding was different
  if (!content.includes("setActiveTab('tester')")) {
    content = content.replace(
      "<span>CatAlogo Monedas ({masterCurrencies.length})</span>\n            </button>",
      "<span>CatAlogo Monedas ({masterCurrencies.length})</span>\n            </button>\n\n" + testerButton
    );
  }
}

// 4. Add Tab Content
const testerTabContent = `          {/* Tab 7: Laboratorio de Reportes */}
          {activeTab === 'tester' && (
            <SystemTesterTab
              masterSystems={masterSystems}
              masterCurrencies={masterCurrencies}
              onSaveSystem={handleSaveMasterSystem}
            />
          )}`;

if (!content.includes("<SystemTesterTab")) {
  content = content.replace(
    "onDeleteCurrency={handleDeleteMasterCurrency}\n            />\n          )}",
    "onDeleteCurrency={handleDeleteMasterCurrency}\n            />\n          )}\n\n" + testerTabContent
  );
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('✅ saas-administrador-web-main/src/App.tsx patched successfully!');
