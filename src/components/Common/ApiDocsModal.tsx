import React from 'react';
import { ApiDocsTab } from '../Settings/ApiDocsTab';
import { X, Code2 } from 'lucide-react';

interface ApiDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiDocsModal: React.FC<ApiDocsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#071217] border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-[#0D1B22] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Conexión de Apps Externas & API de Pagos</h2>
              <p className="text-[11px] text-slate-400">
                Los pagos recibidos a través de esta API ingresan directamente a la <strong>Pizarra de Confirmaciones</strong> para su verificación.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer border border-slate-700/60"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with Custom Scrollbar */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
          <ApiDocsTab onClose={onClose} />
        </div>
      </div>
    </div>
  );
};
