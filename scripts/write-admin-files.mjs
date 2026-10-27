import fs from 'fs';
import path from 'path';

const targetDir = 'C:/Users/Edgar Office/Downloads/saas-administrador-web-main/saas-administrador-web-main/src/components/MasterCatalogTab';

const systemTesterContent = `import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';
import { MasterSystem, MasterCurrency } from '../../types';
import {
  FlaskConical,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Save,
  Sparkles,
  Layers,
  RefreshCw,
  FileText,
  Eye,
  Check,
} from 'lucide-react';

interface Props {
  masterSystems: MasterSystem[];
  masterCurrencies: MasterCurrency[];
  onSaveSystem: (sys: Partial<MasterSystem>) => Promise<boolean>;
}

interface ParsedRowPreview {
  agencia: string;
  venta: number;
  premio: number;
  comision?: number;
  neto: number;
}

const PRESET_SAMPLES: Record<
  string,
  {
    name: string;
    filename: string;
    defaultMoneda: string;
    route: string;
    rows: any[][];
  }
> = {
  GATOWEB: {
    name: 'GatoWeb (Análisis por período / Reporte por Agencia)',
    filename: 'Analisis_Periodo_Gatoweb_2026.xlsx',
    defaultMoneda: 'BS',
    route: 'Reportes ➔ Análisis por período (Agrupado por: Usuario) O Reporte por Agencia',
    rows: [
      ['DISTRIBUIDOR: BANKLOT', '', '', '', ''],
      ['USUARIO', 'VENTAS', 'COMISION', 'PREMIOS', 'SALDO'],
      ['chucho@banklot.net', '125.400,00', '0,00', '32.100,00', '93.300,00'],
      ['agencia_la_15', '85.200,50', '0,00', '15.000,00', '70.200,50'],
      ['taquilla_centro', '45.890,00', '0,00', '8.450,00', '37.440,00'],
      ['TOTALES', '256.490,50', '0,00', '55.550,00', '200.940,50'],
    ],
  },
  KENO: {
    name: 'Keno (LotteryAdmin - Virtual Games Report)',
    filename: 'LotteryAdmin_VirtualGames_Report.xlsx',
    defaultMoneda: 'COP',
    route: 'Reports ➔ Virtual Games Report (o Game History)',
    rows: [
      ['VIRTUAL GAMES REPORT - PERIOD 2026-10-19 / 2026-10-25', '', '', '', ''],
      ['AGENT', 'RECEIVED', 'PAID OUT', 'TOTAL ACCEPTED', 'TOTAL PAID', 'PROFIT'],
      ['MAXIMA CDA 02 T2 (5024)', '0,00', '0,00', '1.450.000', '820.000', '630.000'],
      ['CENTRO GUAJIRO (5025)', '0,00', '0,00', '980.000', '430.000', '550.000'],
      ['TAQUILLA NORTE (5026)', '0,00', '0,00', '650.000', '210.000', '440.000'],
      ['TOTAL', '0,00', '0,00', '3.080.000', '1.460.000', '1.620.000'],
    ],
  },
  BETM3: {
    name: 'BetM3 (Reporte General de Ventas BetM3)',
    filename: 'Reporte_General_BetM3_Pesos.xlsx',
    defaultMoneda: 'COP',
    route: 'Reportes ➔ Ventas por Concesionario / Taquillas',
    rows: [
      ['REPORTE GENERAL DE VENTAS BETM3 - PESO (COP)', '', '', ''],
      ['NOMBRE', 'VENTA', 'PREMIO', 'NETO'],
      ['MAXIMA CDA 02 T2', '2.500.000,00', '1.100.000,00', '1.400.000,00'],
      ['CENTRO GUAJIRO', '1.200.000,00', '600.000,00', '600.000,00'],
      ['TOTAL', '3.700.000,00', '1.700.000,00', '2.000.000,00'],
    ],
  },
  CDAPUESTAS: {
    name: 'CDAPuestas (Jugadas y Liquidación de Terminales)',
    filename: 'CDA_Liquidacion_Semanal.xlsx',
    defaultMoneda: 'USD',
    route: 'Reportes ➔ Jugadas y Liquidación de Terminales',
    rows: [
      ['CDAPUESTAS TERMINAL SETTLEMENT USD', '', '', ''],
      ['AGENCIA', 'TOTAL VENTA', 'TOTAL PREMIOS', 'BALANCE'],
      ['MAXIMA CDA 01', '540,50', '210,00', '330,50'],
      ['AGENCIA LA SUR', '320,00', '95,00', '225,00'],
      ['TOTAL', '860,50', '305,00', '555,50'],
    ],
  },
  GATO_PESOS: {
    name: 'Gato Pesos (Reporte de Ventas en Pesos)',
    filename: 'GatoPesos_Ventas.xlsx',
    defaultMoneda: 'COP',
    route: 'Reportes ➔ Ventas por Entidad / Concesionario',
    rows: [
      ['GATO PESOS COLOMBIA - VENTAS', '', '', ''],
      ['AGENCIA', 'VENTA', 'PREMIOS', 'SALDO'],
      ['MAXIMA CDA 0Z TZ', '1.800.000', '750.000', '1.050.000'],
      ['SUCURSAL 02', '900.000', '320.000', '580.000'],
      ['TOTAL', '2.700.000', '1.070.000', '1.630.000'],
    ],
  },
};

function parseNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/\\s/g, '');
  if (!str) return 0;
  str = str.replace(/[^0-9.,-]/g, '');
  if (!str) return 0;
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      return parseFloat(str.replace(/\\./g, '').replace(',', '.')) || 0;
    } else {
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
  } else if (str.includes(',')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
}

export const SystemTesterTab: React.FC<Props> = ({
  masterSystems,
  onSaveSystem,
}) => {
  const [testedFileName, setTestedFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [columnsList, setColumnsList] = useState<string[]>([]);
  const [headerIndex, setHeaderIndex] = useState<number>(-1);

  // Form Fields
  const [systemName, setSystemName] = useState<string>('');
  const [colAgencia, setColAgencia] = useState<string>('');
  const [colVenta, setColVenta] = useState<string>('');
  const [colPremio, setColPremio] = useState<string>('');
  const [colComision, setColComision] = useState<string>('');
  const [colNeto, setColNeto] = useState<string>('');
  const [baseCurrency, setBaseCurrency] = useState<string>('BS');
  const [description, setDescription] = useState<string>('');

  // Status
  const [detectedCurrency, setDetectedCurrency] = useState<string>('');
  const [isCertified, setIsCertified] = useState<boolean>(false);
  const [previewRows, setPreviewRows] = useState<ParsedRowPreview[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Analyze raw tabular rows
  const analyzeRows = (rows: any[][], fileName: string, presetMoneda?: string, presetRoute?: string) => {
    setTestedFileName(fileName);
    setRawRows(rows);

    const agencyKeywords = ['AGENT', 'AGENCIA', 'NOMBRE', 'USUARIO', 'TAQUILLA', 'BANCA', 'CLIENTE'];
    const ventaKeywords = ['TOTAL ACCEPTED', 'ACCEPTED', 'VENTA', 'VENTAS', 'TOTAL VENTA', 'JUGADO', 'BRUTO'];
    const premioKeywords = ['TOTAL PAID', 'PAID OUT', 'PREMIO', 'PREMIOS', 'TOTAL PREMIOS', 'PAGADO'];
    const comisionKeywords = ['COMISION', 'COMISIÓN', 'COMISIONES', 'GANANCIA'];
    const netoKeywords = ['PROFIT', 'SALDO', 'TOTAL SALDO', 'NETO', 'TOTAL NETO', 'BALANCE'];

    let foundHeaderIdx = -1;
    let foundCols: string[] = [];

    for (let i = 0; i < Math.min(25, rows.length); i++) {
      const rowStr = rows[i].map((c) => String(c ?? '').trim().toUpperCase()).join(' ');
      const hasAg = agencyKeywords.some((k) => rowStr.includes(k));
      const hasFin = ventaKeywords.some((k) => rowStr.includes(k)) || premioKeywords.some((k) => rowStr.includes(k));
      if (hasAg && hasFin) {
        foundHeaderIdx = i;
        foundCols = rows[i].map((c) => String(c ?? '').trim());
        break;
      }
    }

    if (foundHeaderIdx === -1 && rows.length > 0) {
      foundHeaderIdx = 0;
      foundCols = rows[0].map((c, idx) => String(c ?? '').trim() || \`Columna_\${idx + 1}\`);
    }

    setHeaderIndex(foundHeaderIdx);
    setColumnsList(foundCols.filter(Boolean));

    let guessedAg = '';
    let guessedVenta = '';
    let guessedPremio = '';
    let guessedComision = '';
    let guessedNeto = '';

    foundCols.forEach((col) => {
      const u = col.toUpperCase().trim();
      if (!guessedAg && agencyKeywords.some((k) => u === k || u.includes(k))) guessedAg = col;
      if (!guessedVenta && ventaKeywords.some((k) => u === k || u.includes(k))) guessedVenta = col;
      if (!guessedPremio && premioKeywords.some((k) => u === k || u.includes(k))) guessedPremio = col;
      if (!guessedComision && comisionKeywords.some((k) => u === k || u.includes(k))) guessedComision = col;
      if (!guessedNeto && netoKeywords.some((k) => u === k || u.includes(k))) guessedNeto = col;
    });

    setColAgencia(guessedAg);
    setColVenta(guessedVenta);
    setColPremio(guessedPremio);
    setColComision(guessedComision);
    setColNeto(guessedNeto);

    const fileDna = (fileName + ' ' + rows.slice(0, 10).map((r) => r.join(' ')).join(' ')).toUpperCase();
    let detectedCurr = presetMoneda || '';
    if (!detectedCurr) {
      if (fileDna.includes('COP') || fileDna.includes('PESO')) detectedCurr = 'COP';
      else if (fileDna.includes('USD') || fileDna.includes('DOLAR') || fileDna.includes('DÓLAR')) detectedCurr = 'USD';
      else if (fileDna.includes('BS') || fileDna.includes('BOLIVAR') || fileDna.includes('BOLÍVAR') || fileDna.includes('VES')) detectedCurr = 'BS';
      else detectedCurr = 'BS';
    }
    setDetectedCurrency(detectedCurr);
    setBaseCurrency(detectedCurr);

    let guessedSysName = '';
    if (fileDna.includes('GATOWEB') || fileDna.includes('BANKLOT') || fileDna.includes('GATOBETS')) guessedSysName = 'GATOWEB';
    else if (fileDna.includes('KENO') || fileDna.includes('LOTTERYADMIN') || fileDna.includes('VIRTUAL GAMES')) guessedSysName = 'KENO';
    else if (fileDna.includes('BETM3')) guessedSysName = 'BETM3';
    else if (fileDna.includes('CDAPUESTAS') || fileDna.includes('CDA')) guessedSysName = 'CDAPUESTAS';
    else if (fileDna.includes('GATO PESOS')) guessedSysName = 'GATO PESOS';
    else if (fileDna.includes('HIPISMO') || fileDna.includes('RINCONADA')) guessedSysName = 'HIPISMO';
    else if (fileDna.includes('PARLEY INH')) guessedSysName = 'PARLEY INH';

    if (guessedSysName) setSystemName(guessedSysName);

    if (presetRoute) {
      setDescription(presetRoute);
    } else if (guessedSysName && !description) {
      setDescription(\`Reporte oficial del proveedor \${guessedSysName}\`);
    }

    const dataRows = rows.slice(foundHeaderIdx + 1);
    const agIdx = foundCols.indexOf(guessedAg);
    const vIdx = foundCols.indexOf(guessedVenta);
    const pIdx = foundCols.indexOf(guessedPremio);
    const cIdx = guessedComision ? foundCols.indexOf(guessedComision) : -1;
    const nIdx = guessedNeto ? foundCols.indexOf(guessedNeto) : -1;

    const previews: ParsedRowPreview[] = [];
    for (const r of dataRows.slice(0, 10)) {
      const agVal = agIdx !== -1 ? String(r[agIdx] ?? '').trim() : '';
      if (!agVal || agVal.toUpperCase().includes('TOTAL')) continue;

      const vVal = vIdx !== -1 ? parseNum(r[vIdx]) : 0;
      const pVal = pIdx !== -1 ? parseNum(r[pIdx]) : 0;
      const cVal = cIdx !== -1 ? parseNum(r[cIdx]) : 0;
      const nVal = nIdx !== -1 ? parseNum(r[nIdx]) : vVal - pVal - cVal;

      previews.push({
        agencia: agVal,
        venta: vVal,
        premio: pVal,
        comision: cVal,
        neto: nVal,
      });
    }

    setPreviewRows(previews);
    setIsCertified(Boolean(guessedAg && guessedVenta && guessedPremio));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        analyzeRows(data, file.name);
      } catch (err: any) {
        setFeedback({ type: 'error', text: \`Error al leer el archivo: \${err.message || 'Formato no soportado'}\` });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleRefreshPreview = () => {
    if (headerIndex === -1 || rawRows.length === 0) return;

    const dataRows = rawRows.slice(headerIndex + 1);
    const agIdx = columnsList.indexOf(colAgencia);
    const vIdx = columnsList.indexOf(colVenta);
    const pIdx = columnsList.indexOf(colPremio);
    const cIdx = colComision ? columnsList.indexOf(colComision) : -1;
    const nIdx = colNeto ? columnsList.indexOf(colNeto) : -1;

    const previews: ParsedRowPreview[] = [];
    for (const r of dataRows.slice(0, 10)) {
      const agVal = agIdx !== -1 ? String(r[agIdx] ?? '').trim() : '';
      if (!agVal || agVal.toUpperCase().includes('TOTAL')) continue;

      const vVal = vIdx !== -1 ? parseNum(r[vIdx]) : 0;
      const pVal = pIdx !== -1 ? parseNum(r[pIdx]) : 0;
      const cVal = cIdx !== -1 ? parseNum(r[cIdx]) : 0;
      const nVal = nIdx !== -1 ? parseNum(r[nIdx]) : vVal - pVal - cVal;

      previews.push({
        agencia: agVal,
        venta: vVal,
        premio: pVal,
        comision: cVal,
        neto: nVal,
      });
    }

    setPreviewRows(previews);
    setIsCertified(Boolean(colAgencia && colVenta && colPremio));
  };

  const handleCertifyAndSave = async () => {
    if (!systemName.trim()) {
      setFeedback({ type: 'error', text: 'El nombre del sistema es obligatorio.' });
      return;
    }
    if (!colAgencia.trim() || !colVenta.trim() || !colPremio.trim()) {
      setFeedback({ type: 'error', text: 'Debes certificar las 3 columnas obligatorias: Agencia, Venta y Premio.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const sysUpper = systemName.trim().toUpperCase();
      const existing = masterSystems.find((s) => s.nombre_sistema.trim().toUpperCase() === sysUpper);

      const payload: Partial<MasterSystem> = {
        id: existing?.id,
        nombre_sistema: sysUpper,
        col_agencia: colAgencia.trim(),
        col_venta: colVenta.trim(),
        col_premio: colPremio.trim(),
        descripcion: description.trim() || \`Reporte verificado en Laboratorio con divisa base \${baseCurrency}\`,
        icono: '🎰',
      };

      const ok = await onSaveSystem(payload);
      if (ok) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        setFeedback({
          type: 'success',
          text: \`¡Sistema '\${sysUpper}' certificado y guardado con éxito! Sincronizado automáticamente a todas las bancas SaaS.\`,
        });
      } else {
        setFeedback({ type: 'error', text: 'Error al persistir el sistema en catalogo_sistemas_maestro.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: \`Error: \${err.message || 'Error inesperado'}\` });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/60 border border-cyan-500/30 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <FlaskConical className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold font-['Outfit'] text-white">
              Laboratorio de Certificación y Pruebas de Reportes
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            Prueba archivos reales (.xlsx, .csv) de cualquier proveedor de apuestas. El motor analiza las cabeceras,
            detecta las columnas matemáticas, valida la moneda y certifica la plantilla para que ningún cliente SaaS
            tenga que configurar código ni nombres manuales.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-xs font-mono font-bold">
            {masterSystems.length} Sistemas Certificados
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={\`p-4 rounded-xl text-xs flex items-center gap-3 animate-fadeIn \${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }\`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Preset Samples Selector */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Cargar Plantilla de Prueba Pre-Certificada:
          </span>
          <span className="text-[11px] text-slate-400">Prueba instantánea con 1 clic</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESET_SAMPLES).map(([key, sample]) => (
            <button
              key={key}
              type="button"
              onClick={() => analyzeRows(sample.rows, sample.filename, sample.defaultMoneda, sample.route)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-white/10 hover:border-cyan-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>🎰</span>
              <span>{key}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-cyan-300">
                {sample.defaultMoneda}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Upload Dropzone */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border-2 border-dashed border-cyan-500/30 hover:border-cyan-500/60 transition-all text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
          <Upload className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Subir Archivo Real de Ventas para Certificar</h3>
          <p className="text-xs text-slate-400 mt-1">Soporta archivos de Excel (.xlsx, .xls), CSV o texto delimitado</p>
        </div>
        <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-cyan-600/20 transition-all">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Seleccionar Archivo de Mi Equipo</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        {testedFileName && (
          <div className="text-xs text-cyan-300 font-mono font-bold">
            Archivo activo: {testedFileName} ({rawRows.length} filas analizadas)
          </div>
        )}
      </div>

      {/* Analysis & Mapper Workbench */}
      {columnsList.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form & Column Mapper */}
          <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Configuración del Sistema Maestro</h3>
              </div>
              {isCertified ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Listo para Certificar
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Mapeo Incompleto
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Canónico del Sistema:</label>
                <input
                  type="text"
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value.toUpperCase())}
                  placeholder="Ej: GATOWEB, KENO, BETM3"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono font-bold focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Moneda Base Recomendada:</label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono font-bold focus:border-cyan-500 focus:outline-none"
                >
                  <option value="BS">🇻🇪 Bolívares (BS)</option>
                  <option value="COP">🇨🇴 Pesos Colombianos (COP)</option>
                  <option value="USD">🇺🇸 Dólares (USD)</option>
                  <option value="EUR">🇪🇺 Euros (EUR)</option>
                  <option value="USDT">🪙 Tether USDT</option>
                  <option value="BRL">🇧🇷 Real Brasileño (BRL)</option>
                </select>
                {detectedCurrency && (
                  <span className="text-[10px] text-cyan-400 mt-0.5 block">
                    ✨ Divisa auto-detectada en el archivo: {detectedCurrency}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-2.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Mapeo de Columnas Certificadas:
                </span>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-300">Columna Agencia (Requerida):</span>
                    {colAgencia && <span className="text-emerald-400 font-bold">✓</span>}
                  </div>
                  <select
                    value={colAgencia}
                    onChange={(e) => {
                      setColAgencia(e.target.value);
                      setTimeout(handleRefreshPreview, 50);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-cyan-300 font-mono text-xs focus:border-cyan-500"
                  >
                    <option value="">-- Seleccionar Columna --</option>
                    {columnsList.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-300">Columna Venta / Jugado (Requerida):</span>
                    {colVenta && <span className="text-emerald-400 font-bold">✓</span>}
                  </div>
                  <select
                    value={colVenta}
                    onChange={(e) => {
                      setColVenta(e.target.value);
                      setTimeout(handleRefreshPreview, 50);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-emerald-300 font-mono text-xs focus:border-cyan-500"
                  >
                    <option value="">-- Seleccionar Columna --</option>
                    {columnsList.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-300">Columna Premios / Pagado (Requerida):</span>
                    {colPremio && <span className="text-amber-400 font-bold">✓</span>}
                  </div>
                  <select
                    value={colPremio}
                    onChange={(e) => {
                      setColPremio(e.target.value);
                      setTimeout(handleRefreshPreview, 50);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-amber-300 font-mono text-xs focus:border-cyan-500"
                  >
                    <option value="">-- Seleccionar Columna --</option>
                    {columnsList.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">Columna Comisión (Opcional):</span>
                  </div>
                  <select
                    value={colComision}
                    onChange={(e) => {
                      setColComision(e.target.value);
                      setTimeout(handleRefreshPreview, 50);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 font-mono text-xs focus:border-cyan-500"
                  >
                    <option value="">-- Ninguna / Derivada --</option>
                    {columnsList.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Ruta de Descarga / Guía para el Usuario:</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Reportes ➔ Análisis por período (Agrupado por: Usuario)"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleCertifyAndSave}
                disabled={isSaving || !colAgencia || !colVenta || !colPremio || !systemName}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>CERTIFICAR Y REGISTRAR EN CATÁLOGO MAESTRO</span>
              </button>
            </div>
          </div>

          {/* Live Preview Table */}
          <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Vista Previa de Liquidación en Vivo</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {previewRows.length} registros computados
              </span>
            </div>

            {previewRows.length > 0 ? (
              <div className="overflow-x-auto border border-white/5 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Agencia / Taquilla</th>
                      <th className="p-2.5 text-right">Venta</th>
                      <th className="p-2.5 text-right">Premios</th>
                      <th className="p-2.5 text-right">Comisión</th>
                      <th className="p-2.5 text-right">Neto Calculado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-2.5 text-cyan-300 font-semibold">{row.agencia}</td>
                        <td className="p-2.5 text-right text-emerald-300">
                          {row.venta.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-right text-rose-300">
                          {row.premio.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-right text-amber-300">
                          {row.comision ? row.comision.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0,00'}
                        </td>
                        <td className="p-2.5 text-right font-bold text-white">
                          {row.neto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                Selecciona las columnas de Agencia, Venta y Premio para ver el cómputo en vivo.
              </div>
            )}

            {/* Verification checklist */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={\`w-2 h-2 rounded-full \${colAgencia ? 'bg-emerald-400' : 'bg-rose-500'}\`} />
                <span className="text-slate-300">Agencia: {colAgencia || 'No asignada'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={\`w-2 h-2 rounded-full \${colVenta ? 'bg-emerald-400' : 'bg-rose-500'}\`} />
                <span className="text-slate-300">Venta: {colVenta || 'No asignada'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={\`w-2 h-2 rounded-full \${colPremio ? 'bg-emerald-400' : 'bg-rose-500'}\`} />
                <span className="text-slate-300">Premios: {colPremio || 'No asignada'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Systems Currently in Master Catalog */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Sistemas Activos en el Catálogo Maestro Global
          </h3>
          <span className="text-xs text-slate-400">Total: {masterSystems.length}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {masterSystems.map((sys) => (
            <div
              key={sys.id || sys.nombre_sistema}
              className="p-3.5 rounded-xl bg-black/30 border border-white/5 hover:border-cyan-500/30 transition-all space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white font-mono text-xs flex items-center gap-1.5">
                  <span>{sys.icono || '🎰'}</span>
                  <span>{sys.nombre_sistema}</span>
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Certificado
                </span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                <div>Agencia: <span className="text-cyan-300 font-semibold">{sys.col_agencia}</span></div>
                <div>Venta: <span className="text-emerald-300 font-semibold">{sys.col_venta}</span></div>
                <div>Premios: <span className="text-amber-300 font-semibold">{sys.col_premio}</span></div>
              </div>
              {sys.descripcion && (
                <div className="text-[10px] text-slate-500 truncate pt-1 border-t border-white/5">
                  {sys.descripcion}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
`;

fs.writeFileSync(path.join(targetDir, 'SystemTesterTab.tsx'), systemTesterContent, 'utf8');
console.log('✅ SystemTesterTab.tsx written successfully!');
