import fs from 'fs';
import path from 'path';

const SAAS_DIR = 'C:/Users/andyf/Downloads/saas-administrador-web-main';
const appPath = path.join(SAAS_DIR, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

const targetStr = '<FactoryReset onResetToFactory={handleResetToFactory} />\n            </div>\n          )}';

const replacementStr = `<FactoryReset onResetToFactory={handleResetToFactory} />
            </div>
          )}

          {/* Tab 5: Catálogo Global Maestro */}
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
  // Manejar saltos de línea Windows (CRLF) o Unix (LF)
  const normalizedContent = appContent.replace(/<FactoryReset onResetToFactory=\{handleResetToFactory\} \/>\s*<\/div>\s*<\/\)/, '');
  
  if (appContent.includes('<FactoryReset onResetToFactory={handleResetToFactory} />')) {
    const parts = appContent.split('<FactoryReset onResetToFactory={handleResetToFactory} />');
    // Encontrar el siguiente </div>\s*)}
    const postParts = parts[1].split('</div>');
    const remaining = postParts.slice(1).join('</div>');
    
    // postParts[0] tiene los espacios antes de </div>
    // postParts[1] tiene \s*)}
    const closeTab4Match = remaining.match(/^(\s*\)\s*\})/);
    
    appContent = appContent.replace(
      /(<FactoryReset onResetToFactory=\{handleResetToFactory\} \/>\s*<\/div>\s*\)\s*\})/,
      `$1\n\n          {/* Tab 5: Catálogo Global Maestro */}\n          {activeTab === 'master-catalog' && (\n            <MasterCatalogTab\n              systems={masterSystems}\n              currencies={masterCurrencies}\n              onSaveSystem={handleSaveMasterSystem}\n              onDeleteSystem={handleDeleteMasterSystem}\n              onSaveCurrency={handleSaveMasterCurrency}\n              onDeleteCurrency={handleDeleteMasterCurrency}\n            />\n          )}`
    );
  }
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Verificando inserción de MasterCatalogTab en App.tsx:', appContent.includes('<MasterCatalogTab'));
