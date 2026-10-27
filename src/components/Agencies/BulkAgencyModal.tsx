import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { UI_LOCK } from '../../styles/uiDesignLock';
import { cleanAgencyName, normalizarMoneda } from '../../utils/formatters';
import { logAuditEvent } from '../../utils/auditLogger';
import { loadSystemKeywords, saveSystemKeywords } from '../../utils/systemKeywords';
import type { Agency, BetSystem, Currency, Grupo, SystemCycle } from '../../types';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  Building2,
  X,
  Layers,
  ClipboardList,
  Sparkles,
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Tag,
} from 'lucide-react';
import confetti from 'canvas-confetti';

/**
 * Parsea números en formato español/latino o estándar inglés
 * Ejemplo: "68.800,00" -> 68800 | "479,6" -> 479.6 | "10.5" -> 10.5
 */
function parseSpanishNumber(raw: any): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  let str = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (!str) return 0;

  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    } else if (parts.length === 2 && parts[1].length === 3 && parseInt(parts[0], 10) > 0) {
      str = str.replace('.', '');
    }
  }
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
}

export interface RawParsedItem {
  rawNombre: string;
  baseNombre: string;
  detectedMoneda: string;
  comision: number;
  participacion: number;
  sistemas: string[];
  codigoReporte: string;
  usuarioTaquilla?: string;
  grupoId: number | null;
  grupoNombre: string;
}

export interface BulkAgencyRow {
  id: string;
  selected: boolean;
  nombre: string;
  usuarioTaquilla: string;
  comision: number;
  sistemas: string[];
  codigoReporte: string;
  codigosPorMoneda: Record<string, string>;
  monedas: string[];
  participacion: number;
  grupoId: number | null;
  grupoNombre: string;
  status: 'valid' | 'duplicate' | 'error';
  errorMessage?: string;
}

interface BulkAgencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  effectiveUserId: string;
  userEmail: string;
  existingAgencies: Agency[];
  systems: BetSystem[];
  currencies: Currency[];
  groups: Grupo[];
  agencyLimit: number;
  systemCycle?: SystemCycle | null;
  onSuccess: () => Promise<void> | void;
}

export const BulkAgencyModal: React.FC<BulkAgencyModalProps> = ({
  isOpen,
  onClose,
  effectiveUserId,
  userEmail,
  existingAgencies,
  systems,
  currencies,
  groups,
  agencyLimit,
  systemCycle,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workflow Step: 'upload' (upload file / paste text) vs 'preview' (full analysis & table)
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');

  // Fallback / Defaults
  const [defaultComision, setDefaultComision] = useState('10');
  const [defaultParticipacion, setDefaultParticipacion] = useState('0');
  const [defaultSystemMode, setDefaultSystemMode] = useState<string>('ALL');
  const [defaultClaveTaquilla, setDefaultClaveTaquilla] = useState('1234');

  // Palabras Claves del Proveedor / Sistema (Columna Agencia, Columna Ventas, Columna Premios)
  const [keywordAgencia, setKeywordAgencia] = useState('Agentes');
  const [keywordVenta, setKeywordVenta] = useState('Ventas');
  const [keywordPremio, setKeywordPremio] = useState('Premios');

  // Multi-Currency Consolidation Toggle
  // e.g. "15LETRAS1 Bs" + "15LETRAS1 Usd" -> 1 single agency "15LETRAS1" with currencies [BS, USD]
  const [consolidateMultiCurrency, setConsolidateMultiCurrency] = useState(true);

  // Raw Parsed Items (preserved to recompute when toggling consolidation)
  const [rawItems, setRawItems] = useState<RawParsedItem[]>([]);

  // Generated Rows for preview table
  const [rows, setRows] = useState<BulkAgencyRow[]>([]);

  // Filter & Pagination State
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'duplicate' | 'error'>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);

  // Active systems and currencies lists
  const activeSystemNames = useMemo(() => systems.map((s) => s.nombre_sistema.trim()), [systems]);
  const activeCurrencyCodes = useMemo(
    () => currencies.map((c) => c.nombre_moneda.trim().toUpperCase()),
    [currencies]
  );

  // Existing agencies lookup set
  const existingAgenciesSet = useMemo(() => {
    const set = new Set<string>();
    existingAgencies.forEach((a) => {
      const clean = cleanAgencyName(a.nombre_agencia);
      if (clean) set.add(clean.toUpperCase());
    });
    return set;
  }, [existingAgencies]);

  // Quota calculations
  const availableSlots = Math.max(0, agencyLimit - existingAgencies.length);
  const selectedValidRows = useMemo(
    () => rows.filter((r) => r.selected && r.status === 'valid'),
    [rows]
  );
  const isOverQuota = selectedValidRows.length > availableSlots;

  // Analysis Breakdown by Currency
  const currencyBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      r.monedas.forEach((m) => {
        counts[m] = (counts[m] || 0) + 1;
      });
    });
    return counts;
  }, [rows]);

  // Statistics
  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.status === 'valid').length;
    const duplicate = rows.filter((r) => r.status === 'duplicate').length;
    const errors = rows.filter((r) => r.status === 'error').length;
    const selected = rows.filter((r) => r.selected && r.status === 'valid').length;
    return { total, valid, duplicate, errors, selected };
  }, [rows]);

  // Transform raw parsed items into rows based on consolidation toggle
  const buildRowsFromRawItems = (items: RawParsedItem[], consolidate: boolean) => {
    if (!items || items.length === 0) {
      setRows([]);
      return;
    }

    const result: BulkAgencyRow[] = [];

    if (consolidate) {
      // Group by base name
      const map = new Map<string, RawParsedItem[]>();
      items.forEach((item) => {
        const key = item.baseNombre.toUpperCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      });

      let idx = 0;
      map.forEach((groupedItems) => {
        idx++;
        const primary = groupedItems[0];
        const allMons = Array.from(
          new Set(
            groupedItems
              .map((it) => it.detectedMoneda)
              .filter(Boolean)
          )
        );
        const finalMons = allMons.length > 0 ? allMons : activeCurrencyCodes.slice(0, 3);

        // Auto-codes/IDs: ONLY exact codes from report (no spurious baseNombre)
        // Also map code per currency:
        const codeMapByCurrency: Record<string, string> = {};
        const codeSet = new Set<string>();

        groupedItems.forEach((it) => {
          const rawCode = it.codigoReporte || it.rawNombre;
          if (rawCode) {
            codeSet.add(rawCode);
            if (it.detectedMoneda) {
              codeMapByCurrency[it.detectedMoneda] = rawCode;
            }
          }
        });
        const combinedCodes = Array.from(codeSet).filter(Boolean).join(', ');

        const clean = cleanAgencyName(primary.baseNombre);
        let status: 'valid' | 'duplicate' | 'error' = 'valid';
        let errorMessage: string | undefined = undefined;

        if (!clean) {
          status = 'error';
          errorMessage = 'Nombre vacío';
        } else if (existingAgenciesSet.has(clean)) {
          status = 'duplicate';
          errorMessage = 'La agencia ya existe en el catálogo';
        }

        const defaultUser = (primary.usuarioTaquilla || primary.baseNombre || '').trim().toUpperCase();

        result.push({
          id: `ag_cons_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          selected: status === 'valid',
          nombre: primary.baseNombre.toUpperCase(),
          usuarioTaquilla: defaultUser,
          comision: primary.comision,
          sistemas: primary.sistemas,
          codigoReporte: combinedCodes,
          codigosPorMoneda: codeMapByCurrency,
          monedas: finalMons,
          participacion: primary.participacion,
          grupoId: primary.grupoId,
          grupoNombre: primary.grupoNombre,
          status,
          errorMessage,
        });
      });
    } else {
      // Individual rows (1 agency per row)
      items.forEach((item, idx) => {
        const clean = cleanAgencyName(item.rawNombre);
        let status: 'valid' | 'duplicate' | 'error' = 'valid';
        let errorMessage: string | undefined = undefined;

        if (!clean) {
          status = 'error';
          errorMessage = 'Nombre vacío';
        } else if (existingAgenciesSet.has(clean)) {
          status = 'duplicate';
          errorMessage = 'La agencia ya existe en el catálogo';
        }

        // Code in report: only exact item.codigoReporte or item.rawNombre (no baseNombre appended)
        const exactCode = item.codigoReporte || item.rawNombre;
        const codeMapByCurrency: Record<string, string> = {};
        if (item.detectedMoneda && exactCode) {
          codeMapByCurrency[item.detectedMoneda] = exactCode;
        }

        const defaultUser = (item.usuarioTaquilla || item.baseNombre || item.rawNombre || '').trim().toUpperCase();

        result.push({
          id: `ag_ind_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          selected: status === 'valid',
          nombre: item.rawNombre.toUpperCase(),
          usuarioTaquilla: defaultUser,
          comision: item.comision,
          sistemas: item.sistemas,
          codigoReporte: exactCode,
          codigosPorMoneda: codeMapByCurrency,
          monedas: item.detectedMoneda ? [item.detectedMoneda] : activeCurrencyCodes.slice(0, 3),
          participacion: item.participacion,
          grupoId: item.grupoId,
          grupoNombre: item.grupoNombre,
          status,
          errorMessage,
        });
      });
    }

    setRows(result);
    setCurrentPage(1);
  };

  // Re-build rows whenever consolidation toggle changes
  const handleToggleConsolidation = (newVal: boolean) => {
    setConsolidateMultiCurrency(newVal);
    buildRowsFromRawItems(rawItems, newVal);
  };

  // Download official template XLSX
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const sampleSys = activeSystemNames.length > 0 ? activeSystemNames[0] : 'BETM3';
    const sampleSys2 = activeSystemNames.length > 1 ? activeSystemNames[1] : sampleSys;
    const sampleMon = activeCurrencyCodes.length > 0 ? activeCurrencyCodes[0] : 'BS';

    const headers = [
      'Nombre Agencia',
      'Comision %',
      'Sistema',
      'Codigo / ID Reporte',
      'Usuario Taquilla',
      'Moneda',
      'Participacion %',
      'Grupo',
    ];

    const data = [
      headers,
      ['AGENCIA CENTRO 01', 10, sampleSys, 'MAXIMA CUA 02 T2', 'CENTRO01', sampleMon, 50, ''],
      ['AGENCIA PLAZA', 12, sampleSys2, 'ID_PLAZA_01, 502', 'PLAZA_POS', sampleMon, 50, ''],
      ['AGENCIA LA COROMOTO', 15, activeSystemNames.join(', '), 'chucho@banklot.net, 504', 'COROMOTO', sampleMon, 50, ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 26 },
      { wch: 14 },
      { wch: 22 },
      { wch: 34 },
      { wch: 20 },
      { wch: 12 },
      { wch: 16 },
      { wch: 20 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Agencias');
    XLSX.writeFile(wb, 'plantilla_agencias_nuevas.xlsx');
  };

  // Parse raw 2D tabular array into raw items
  const parseTabularData = (rawRows: any[][], sourceName = '') => {
    setErrorMsg(null);
    if (!rawRows || rawRows.length < 2) {
      setErrorMsg('El archivo o texto no contiene suficientes filas para procesar.');
      return;
    }

    const NAME_SYNONYMS = ['AGENCIA', 'NOMBRE', 'NOMBRE AGENCIA', 'PUNTO', 'LOCAL', 'AGENTES', 'AGENTE'];
    const VENTA_SYNONYMS = ['VENTA', 'VENTAS', 'TOTAL ACCEPTED', 'ACCEPTED', 'JUGADO', 'BRUTO'];
    const PREMIO_SYNONYMS = ['PREMIO', 'PREMIOS', 'TOTAL PAID', 'PAID OUT', 'PAGADO'];
    const COM_SYNONYMS = ['COMISION', 'COMISIÓN', 'COMISION %', 'COM %', '% COMISION', '% VENTA TAQ', '% VENTA'];
    const SYS_SYNONYMS = ['SISTEMA', 'SISTEMAS', 'PROVEEDOR', 'PLATAFORMA'];
    const CODE_SYNONYMS = [
      'CODIGO',
      'CÓDIGO',
      'ID REPORTE',
      'USUARIO REPORTE',
      'EQUIVALENCIA',
      'ALIAS',
    ];
    const MON_SYNONYMS = ['MONEDA', 'MONEDAS', 'DIVISA'];
    const PART_SYNONYMS = ['PARTICIPACION', 'PARTICIPACIÓN', 'PART %', '% PAR REC', '%P BANCA'];
    const GRP_SYNONYMS = ['GRUPO', 'INTERMEDIARIO', 'RED'];

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const line = rawRows[i].map((c) => String(c ?? '').trim().toUpperCase()).join(' ');
      if (NAME_SYNONYMS.some((syn) => line.includes(syn))) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) headerRowIdx = 0;

    const rawHeaderCells = rawRows[headerRowIdx];
    const headers = rawHeaderCells.map((c) => String(c ?? '').trim().toUpperCase());

    const colNombre = headers.findIndex((h) => NAME_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colVenta = headers.findIndex((h) => VENTA_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colPremio = headers.findIndex((h) => PREMIO_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colCom = headers.findIndex((h) => COM_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colSys = headers.findIndex((h) => SYS_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colCode = headers.findIndex((h) => CODE_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colUser = headers.findIndex((h) =>
      ['USUARIO', 'USER', 'USUARIO TAQUILLA', 'LOGIN', 'TERMINAL', 'TAQUILLA', 'CAJERO'].some(
        (syn) => h === syn || h.includes(syn)
      )
    );
    const colMon = headers.findIndex((h) => MON_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colPart = headers.findIndex((h) => PART_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colGrp = headers.findIndex((h) => GRP_SYNONYMS.some((syn) => h === syn || h.includes(syn)));

    // Extraer y detectar las Palabras Claves del Proveedor / Sistema
    const detectedKwAgencia = colNombre !== -1 && rawHeaderCells[colNombre] ? String(rawHeaderCells[colNombre]).trim() : 'Agentes';
    const detectedKwVenta = colVenta !== -1 && rawHeaderCells[colVenta] ? String(rawHeaderCells[colVenta]).trim() : 'Ventas';
    const detectedKwPremio = colPremio !== -1 && rawHeaderCells[colPremio] ? String(rawHeaderCells[colPremio]).trim() : 'Premios';

    setKeywordAgencia(detectedKwAgencia);
    setKeywordVenta(detectedKwVenta);
    setKeywordPremio(detectedKwPremio);

    // System detection from file name or defaults
    let detectedFileSys = defaultSystemMode;
    if (sourceName) {
      const upperName = sourceName.toUpperCase();
      const matchedSys = systems.find((s) => upperName.includes(s.nombre_sistema.toUpperCase()));
      if (matchedSys) {
        detectedFileSys = matchedSys.nombre_sistema;
        setDefaultSystemMode(matchedSys.nombre_sistema);
      }
    }

    const items: RawParsedItem[] = [];

    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawCell = String(row[colNombre !== -1 ? colNombre : 0] ?? '').trim();
      if (!rawCell || rawCell.toUpperCase().startsWith('TOTAL') || rawCell.toUpperCase() === 'NAN') {
        continue;
      }

      // Check currency suffix in agent name (e.g. "15LETRAS1 Bs" -> base: "15LETRAS1", mon: "BS")
      const currMatch = rawCell.match(/^(.*?)\s+(BS|USD|COP|VES|EUR|USDT)$/i);
      const baseNombre = currMatch ? currMatch[1].trim() : rawCell;
      let detectedMoneda = currMatch ? normalizarMoneda(currMatch[2]) : '';

      // If currency column exists
      if (!detectedMoneda && colMon !== -1 && row[colMon] !== undefined) {
        detectedMoneda = normalizarMoneda(String(row[colMon]));
      }

      // Fallback currency
      if (!detectedMoneda) {
        detectedMoneda = activeCurrencyCodes[0] || 'BS';
      }

      // Comisión % Matemática Inteligente:
      // Si la columna es monto en dinero (ej. 6.880,00 sobre venta de 68.800,00),
      // calcular (Comisión Monto / Venta Monto) * 100 = 10%
      let comVal = Number(defaultComision) || 10;
      const montoVenta = colVenta !== -1 ? parseSpanishNumber(row[colVenta]) : 0;
      const rawComCell = colCom !== -1 ? row[colCom] : undefined;

      if (rawComCell !== undefined && String(rawComCell).trim() !== '') {
        const rawComStr = String(rawComCell).trim();
        const parsedComNum = parseSpanishNumber(rawComStr);

        if (rawComStr.includes('%') && parsedComNum > 0 && parsedComNum <= 100) {
          comVal = parsedComNum;
        } else if (montoVenta > 0 && parsedComNum > 0) {
          const ratio = (parsedComNum / montoVenta) * 100;
          if (ratio > 0 && ratio <= 100) {
            comVal = Math.round(ratio * 10) / 10;
          } else if (parsedComNum > 0 && parsedComNum <= 50) {
            comVal = parsedComNum;
          }
        } else if (parsedComNum > 0 && parsedComNum <= 50) {
          comVal = parsedComNum;
        }
      }

      // Participación %
      let partVal = Number(defaultParticipacion) || 0;
      if (colPart !== -1 && row[colPart] !== undefined && String(row[colPart]).trim() !== '') {
        const parsedPart = parseSpanishNumber(row[colPart]);
        if (parsedPart >= 0 && parsedPart <= 100) {
          partVal = parsedPart;
        }
      }

      // Sistemas
      let assignedSystems: string[] = [];
      if (colSys !== -1 && row[colSys] !== undefined && String(row[colSys]).trim() !== '') {
        const splitted = String(row[colSys])
          .split(/[,;\/|]/)
          .map((s) => s.trim())
          .filter(Boolean);

        splitted.forEach((item) => {
          const match = systems.find(
            (sys) => sys.nombre_sistema.trim().toUpperCase() === item.toUpperCase()
          );
          assignedSystems.push(match ? match.nombre_sistema.trim() : item.toUpperCase());
        });
      }

      if (assignedSystems.length === 0) {
        if (detectedFileSys === 'ALL') {
          assignedSystems = activeSystemNames.length > 0 ? [...activeSystemNames] : ['GENERAL'];
        } else {
          assignedSystems = [detectedFileSys];
        }
      }

      // Código / ID en Reporte
      let codigoReporte = '';
      if (colCode !== -1 && row[colCode] !== undefined) {
        codigoReporte = String(row[colCode]).trim();
      }

      // Usuario Taquilla
      let usuarioTaquilla = baseNombre || rawCell;
      if (colUser !== -1 && row[colUser] !== undefined && String(row[colUser]).trim() !== '') {
        usuarioTaquilla = String(row[colUser]).trim();
      }

      // Grupo
      let grupoId: number | null = null;
      let grupoNombre = '';
      if (colGrp !== -1 && row[colGrp] !== undefined && String(row[colGrp]).trim() !== '') {
        const rawGrp = String(row[colGrp]).trim().toUpperCase();
        const matchedGrp = groups.find((g) => g.nombre_grupo.trim().toUpperCase() === rawGrp);
        if (matchedGrp) {
          grupoId = matchedGrp.id;
          grupoNombre = matchedGrp.nombre_grupo;
        }
      }

      items.push({
        rawNombre: rawCell,
        baseNombre: baseNombre || rawCell,
        detectedMoneda,
        comision: comVal,
        participacion: partVal,
        sistemas: Array.from(new Set(assignedSystems)),
        codigoReporte,
        usuarioTaquilla,
        grupoId,
        grupoNombre,
      });
    }

    if (items.length === 0) {
      setErrorMsg('No se detectaron registros válidos en las filas analizadas.');
      return;
    }

    setRawItems(items);
    setFileName(sourceName);
    buildRowsFromRawItems(items, consolidateMultiCurrency);
    setStep('preview');
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setErrorMsg('El archivo no contiene hojas válidas.');
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        parseTabularData(rawRows, file.name);
      } catch (err: any) {
        console.error('Error parsing excel:', err);
        setErrorMsg('Error al interpretar el archivo: ' + (err?.message || 'Formato desconocido'));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Direct Text Paste Handler
  const handleProcessPastedText = () => {
    if (!pasteText.trim()) {
      setErrorMsg('Pega el contenido copiado de tu hoja de cálculo en el área de texto.');
      return;
    }

    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setErrorMsg('No hay líneas válidas para procesar.');
      return;
    }

    const rawRows = lines.map((line) => {
      if (line.includes('\t')) return line.split('\t');
      if (line.includes(';')) return line.split(';');
      return line.split(',');
    });

    const firstLineUpper = lines[0].toUpperCase();
    const hasHeaderSignature =
      firstLineUpper.includes('AGENCIA') ||
      firstLineUpper.includes('NOMBRE') ||
      firstLineUpper.includes('COMISION') ||
      firstLineUpper.includes('SISTEMA') ||
      firstLineUpper.includes('CODIGO');

    let finalRows = rawRows;
    if (!hasHeaderSignature) {
      const synthHeaders = ['Nombre Agencia', 'Comision %', 'Sistema', 'Codigo / ID Reporte'];
      finalRows = [synthHeaders, ...rawRows];
    }

    parseTabularData(finalRows, 'Texto Copiado');
  };

  // Update a single field in rows
  const handleUpdateRow = (rowId: string, field: keyof BulkAgencyRow, val: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated = { ...r, [field]: val };

        if (field === 'nombre') {
          const clean = cleanAgencyName(String(val).toUpperCase());
          if (!clean) {
            updated.status = 'error';
            updated.errorMessage = 'Nombre vacío';
          } else if (existingAgenciesSet.has(clean)) {
            updated.status = 'duplicate';
            updated.errorMessage = 'La agencia ya existe';
          } else {
            updated.status = 'valid';
            updated.errorMessage = undefined;
          }
          if (!updated.usuarioTaquilla || updated.usuarioTaquilla === r.nombre) {
            updated.usuarioTaquilla = String(val).toUpperCase();
          }
        }

        if (field === 'codigoReporte') {
          const parts = String(val).split(',').map((p) => p.trim()).filter(Boolean);
          const newMap: Record<string, string> = {};
          parts.forEach((p) => {
            const mMatch = p.match(/\b(BS|USD|COP|VES|EUR|USDT)\b/i);
            if (mMatch) {
              newMap[normalizarMoneda(mMatch[1])] = p;
            }
          });
          if (Object.keys(newMap).length > 0) {
            updated.codigosPorMoneda = { ...(updated.codigosPorMoneda || {}), ...newMap };
          } else if (updated.monedas.length === 1) {
            updated.codigosPorMoneda = { [updated.monedas[0]]: String(val).trim() };
          }
        }

        return updated;
      })
    );
  };

  // Remove single row
  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Toggle single selection
  const handleToggleSelect = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  // Select / Deselect All
  const handleToggleSelectAll = (select: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.status === 'valid' ? { ...r, selected: select } : r))
    );
  };

  // Apply bulk commission to all selected
  const handleApplyBulkCommission = (comVal: number) => {
    setRows((prev) =>
      prev.map((r) => (r.selected ? { ...r, comision: comVal } : r))
    );
  };

  // Apply bulk system to all selected
  const handleApplyBulkSystem = (sysName: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.selected
          ? {
              ...r,
              sistemas: sysName === 'ALL' ? [...activeSystemNames] : [sysName],
            }
          : r
      )
    );
  };

  // Filtered rows for analysis
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (currencyFilter !== 'all' && !r.monedas.includes(currencyFilter)) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchName = r.nombre.toLowerCase().includes(q);
        const matchCode = r.codigoReporte.toLowerCase().includes(q);
        const matchSys = r.sistemas.some((s) => s.toLowerCase().includes(q));
        const matchUser = (r.usuarioTaquilla || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchSys && !matchUser) return false;
      }

      return true;
    });
  }, [rows, statusFilter, currencyFilter, searchFilter]);

  // Paginated Rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Save All Selected Valid Agencies
  const handleSaveAll = async () => {
    const toSave = rows.filter((r) => r.selected && r.status === 'valid');
    if (toSave.length === 0) {
      setErrorMsg('No hay agencias válidas seleccionadas para registrar.');
      return;
    }

    if (toSave.length > availableSlots) {
      setErrorMsg(
        `Has seleccionado ${toSave.length} agencias pero tu cupo SaaS disponible es de ${availableSlots}. Deselecciona algunas o amplía tu suscripción.`
      );
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setProgress({ current: 0, total: toSave.length });

    try {
      // 1. Guardar las Palabras Claves del Proveedor / Sistema en systemKeywords
      try {
        const currentKeywords = await loadSystemKeywords(effectiveUserId);
        const targetSystem =
          defaultSystemMode === 'ALL'
            ? systems[0]?.nombre_sistema || 'PARLEY INH'
            : defaultSystemMode;
        const targetUpper = targetSystem.trim().toUpperCase();

        currentKeywords[targetUpper] = {
          ...(currentKeywords[targetUpper] || {}),
          agencia: keywordAgencia.trim() || 'Agentes',
          venta: keywordVenta.trim() || 'Ventas',
          premio: keywordPremio.trim() || 'Premios',
        };
        await saveSystemKeywords(effectiveUserId, currentKeywords);
      } catch (kwErr) {
        console.warn('Error guardando palabras claves del sistema:', kwErr);
      }

      // 2. Registrar agencias en la base de datos
      let insertedCount = 0;

      for (let i = 0; i < toSave.length; i++) {
        const row = toSave[i];
        setProgress({ current: i + 1, total: toSave.length });

        // Build condiciones_sistemas JSON
        const condicionesObj: Record<string, any> = {};
        const safeSystems = row.sistemas.length > 0 ? row.sistemas : ['GENERAL'];
        const safeCurrencies = row.monedas.length > 0 ? row.monedas : ['USD'];

        safeSystems.forEach((sys) => {
          safeCurrencies.forEach((mon) => {
            const comboKey = `${sys}_${mon}`;
            const specificCode = row.codigosPorMoneda?.[mon] || row.codigoReporte;
            const entry: any = {
              sistema: sys,
              moneda: mon,
              comision: Number(row.comision),
              participacion: Number(row.participacion),
            };
            if (specificCode && specificCode.trim()) {
              entry.codigo = specificCode.trim();
            }
            condicionesObj[comboKey] = entry;
            if (!condicionesObj[sys]) {
              condicionesObj[sys] = entry;
            }
          });
        });

        // Cashier POS username: use the visible, editable user or fallback to agency name
        const taquillaUser = (row.usuarioTaquilla || row.nombre || 'agencia')
          .trim()
          .replace(/\s+/g, '_');
        const taquillaPass = defaultClaveTaquilla.trim() || '1234';

        const payload: any = {
          user_id: effectiveUserId,
          nombre_agencia: row.nombre.trim().toUpperCase(),
          sistemas: safeSystems.join(', '),
          monedas: safeCurrencies.join(', '),
          comision: Number(row.comision),
          participacion_ag: Number(row.participacion),
          condiciones_sistemas: JSON.stringify(condicionesObj),
          cuentas_asignadas: 'NINGUNA',
          usuario_taquilla: taquillaUser,
          clave_taquilla: taquillaPass,
          grupo_id: row.grupoId,
          grupo_nombre: row.grupoNombre || null,
          saldo_inicial_bs: 0,
          saldo_inicial_usd: 0,
          saldo_inicial_cop: 0,
        };

        // Insert agency with resilient fallback
        let insData: any;
        let insErr: any;
        const res = await supabase.from('agencias').insert(payload).select().single();
        insData = res.data;
        insErr = res.error;

        if (insErr && (insErr.message?.includes('grupo_id') || insErr.code === '42703')) {
          const { grupo_id, grupo_nombre, ...safePayload } = payload;
          const retryRes = await supabase.from('agencias').insert(safePayload).select().single();
          insData = retryRes.data;
          insErr = retryRes.error;
        }

        if (insErr) {
          console.error(`Error insertando agencia ${row.nombre}:`, insErr);
          continue;
        }

        const agencyId = insData.id;
        insertedCount++;

        // Insert cashier credential in taquilla_usuarios
        try {
          await supabase.from('taquilla_usuarios').insert({
            user_id: effectiveUserId,
            usuario: taquillaUser,
            clave: taquillaPass,
            agencia_id: agencyId,
            nombre_cajero: row.nombre.trim().toUpperCase(),
            rol: 'agencia',
            activo: true,
          });
        } catch (tuErr) {
          console.warn('Error creating taquilla user for bulk agency:', tuErr);
        }
      }

      // Log audit event
      await logAuditEvent({
        user_id: effectiveUserId,
        usuario: userEmail || 'Administración',
        modulo: 'AGENCIAS',
        tipo_accion: 'CREAR_AGENCIA',
        entidad_afectada: `${insertedCount} Agencias`,
        descripcion: `Carga masiva completada: ${insertedCount} nuevas agencias registradas con comisiones, sistemas y palabras claves guardadas en el proveedor.`,
        impacto_financiero: 'MEDIO',
        semana_ciclo: String(systemCycle?.semana || ''),
        ciclo_periodo:
          systemCycle?.desde && systemCycle?.hasta
            ? `${systemCycle.desde} al ${systemCycle.hasta}`
            : undefined,
      });

      confetti({ particleCount: 80, spread: 90 });
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving bulk agencies:', err);
      setErrorMsg(err?.message || 'Error general al registrar agencias masivas.');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={UI_LOCK.modalBackdrop}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 animate-fade-in">
        {/* ========================================================= */}
        {/* MODAL HEADER                                              */}
        {/* ========================================================= */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                disabled={isProcessing}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                title="Volver a cargar otro archivo"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className={UI_LOCK.headerIconWrap}>
              <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {step === 'upload' ? 'Carga Masiva de Agencias' : 'Panel de Análisis y Previsualización'}
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {step === 'upload' ? 'Excel / CSV' : `${stats.total} Agencias`}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {step === 'upload'
                  ? 'Arrastra un archivo o pega filas con Nombre, Comisión %, Sistema y Código en Reporte'
                  : `Analiza, filtra y ajusta las agencias y palabras claves antes de registrarlas`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 'upload' && (
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Descargar plantilla Excel oficial de ejemplo"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Plantilla Excel</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* STEP 1: UPLOAD & CONFIGURATION                            */}
        {/* ========================================================= */}
        {step === 'upload' && (
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* SaaS Quota Status Bar */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Cuota Disponible en tu Plan SaaS: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-black">{availableSlots}</span> de {agencyLimit} plazas disponibles
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Actualmente tienes {existingAgencies.length} agencias registradas en tu catálogo activo.
                  </div>
                </div>
              </div>
            </div>

            {/* Config Defaults / Fallbacks Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                <span>Valores por defecto si la fila no especifica columna:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Comisión General %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={defaultComision}
                      onChange={(e) => setDefaultComision(e.target.value)}
                      className={UI_LOCK.input + ' pr-8'}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Sistema de Respaldo
                  </label>
                  <select
                    value={defaultSystemMode}
                    onChange={(e) => setDefaultSystemMode(e.target.value)}
                    className={UI_LOCK.select}
                  >
                    <option value="ALL">✓ Todos los sistemas activos</option>
                    {systems.map((s) => (
                      <option key={s.id} value={s.nombre_sistema}>
                        {s.nombre_sistema}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Participación Agencia %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={defaultParticipacion}
                      onChange={(e) => setDefaultParticipacion(e.target.value)}
                      className={UI_LOCK.input + ' pr-8'}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Clave Taquilla POS
                  </label>
                  <input
                    type="text"
                    value={defaultClaveTaquilla}
                    onChange={(e) => setDefaultClaveTaquilla(e.target.value)}
                    className={UI_LOCK.input}
                    placeholder="1234"
                  />
                </div>
              </div>
            </div>

            {/* Mode Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={activeTab === 'file' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5" />
                Subir Archivo Excel / CSV
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={activeTab === 'paste' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
              >
                <ClipboardList className="w-3.5 h-3.5 inline mr-1.5" />
                Pegar Texto desde Excel / Sheets
              </button>
            </div>

            {/* Tab 1: Dropzone */}
            {activeTab === 'file' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-3xl p-10 sm:p-14 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 hover:bg-emerald-500/5 transition-all group"
                >
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform shadow-xs">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Haz clic o arrastra aquí tu archivo Excel (.xlsx, .xls) o CSV (.csv)
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                    Columnas detectadas automáticamente: <strong>Agencia / Nombre</strong>, <strong>Comisión %</strong>, <strong>Sistema</strong> y <strong>Código / ID en Reporte</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Textarea */}
            {activeTab === 'paste' && (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Pega las celdas copiadas directamente de tu archivo:</span>
                  <span className="text-[11px] font-normal text-slate-400">Separado por tabulador o coma</span>
                </label>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`15LETRAS1 Bs\t10\tPARLEY INH\t15LETRAS1 Bs, 15LETRAS1\n15LETRAS1 Usd\t10\tPARLEY INH\t15LETRAS1 Usd\nAGALEJO Bs\t12\tPARLEY INH\tAGALEJO Bs`}
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-2xl p-3.5 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleProcessPastedText}
                    className={UI_LOCK.buttonPrimary + ' text-xs'}
                  >
                    <Sparkles className="w-4 h-4" />
                    Analizar y Previsualizar
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className={UI_LOCK.errorBanner}>
                <XCircle className="w-5 h-5 shrink-0" />
                <div className="text-xs font-semibold">{errorMsg}</div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 2: DEDICATED PREVIEW & ANALYSIS VIEW (FULL HEIGHT)   */}
        {/* ========================================================= */}
        {step === 'preview' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50/30 dark:bg-slate-900/40">
            {/* Top Analysis Bar & Quick KPIs */}
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 space-y-3">
              {/* File info badge & Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                      {fileName || 'Archivo Analizado'}
                    </span>
                    <span className="text-slate-400 font-normal">({rawItems.length} filas fuente)</span>
                  </div>

                  {/* Multi-Currency Consolidation Toggle */}
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold cursor-pointer select-none transition-all hover:bg-emerald-100 dark:hover:bg-emerald-500/20">
                    <input
                      type="checkbox"
                      checked={consolidateMultiCurrency}
                      onChange={(e) => handleToggleConsolidation(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span>Consolidar Multi-Moneda (Unir filas Bs + Usd de la misma agencia)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Ajustes en Lote</span>
                  </button>
                </div>

                {/* Quota warning if exceeded */}
                {isOverQuota && (
                  <div className="px-3 py-1 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Superas tu cupo disponible ({availableSlots})</span>
                  </div>
                )}
              </div>

              {/* PALABRAS CLAVES DEL SISTEMA / PROVEEDOR (SECCIÓN DEDICADA) */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                      Palabras Claves del Proveedor / Sistema (
                      {defaultSystemMode === 'ALL' ? 'PARLEY INH' : defaultSystemMode})
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20">
                      Detectadas del Encabezado
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Se guardarán para que el módulo <strong>Cargar Ventas</strong> identifique estas columnas automáticamente
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1 uppercase tracking-wider">
                      Palabra Clave Agencia:
                    </label>
                    <input
                      type="text"
                      value={keywordAgencia}
                      onChange={(e) => setKeywordAgencia(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-600/50 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ej: Agentes"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1 uppercase tracking-wider">
                      Palabra Clave Ventas:
                    </label>
                    <input
                      type="text"
                      value={keywordVenta}
                      onChange={(e) => setKeywordVenta(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-600/50 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ej: Ventas"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1 uppercase tracking-wider">
                      Palabra Clave Premios:
                    </label>
                    <input
                      type="text"
                      value={keywordPremio}
                      onChange={(e) => setKeywordPremio(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-600/50 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ej: Premios"
                    />
                  </div>
                </div>
              </div>

              {/* Quick KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Agencias Totales</div>
                  <div className="text-base font-black text-slate-900 dark:text-white font-mono mt-0.5">
                    {stats.total}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-200/80 dark:border-emerald-500/20">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase">Listas para Registrar</div>
                  <div className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                    {stats.selected}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-cyan-50/50 dark:bg-cyan-500/5 border border-cyan-200/80 dark:border-cyan-500/20">
                  <div className="text-[10px] font-bold text-cyan-600 uppercase">Monedas Identificadas</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {Object.entries(currencyBreakdown).map(([mon, count]) => (
                      <span
                        key={mon}
                        className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-cyan-100/70 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300"
                      >
                        {mon}: {count}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Cupo SaaS Restante</div>
                  <div className="text-base font-black text-slate-800 dark:text-slate-200 font-mono mt-0.5">
                    {Math.max(0, availableSlots - stats.selected)} / {agencyLimit}
                  </div>
                </div>
              </div>

              {/* Batch Settings Slide-down Drawer */}
              {showConfigDrawer && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Aplicar a las {stats.selected} seleccionadas:
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Comisión %:</span>
                      {[10, 12, 15, 20].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleApplyBulkCommission(c)}
                          className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-emerald-500"
                        >
                          {c}%
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Sistema:</span>
                      <select
                        onChange={(e) => handleApplyBulkSystem(e.target.value)}
                        className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs rounded-lg px-2 py-1"
                        defaultValue=""
                      >
                        <option value="" disabled>Seleccionar sistema...</option>
                        <option value="ALL">Todos los sistemas</option>
                        {systems.map((s) => (
                          <option key={s.id} value={s.nombre_sistema}>
                            {s.nombre_sistema}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfigDrawer(false)}
                    className="text-xs text-slate-500 hover:underline cursor-pointer"
                  >
                    Ocultar
                  </button>
                </div>
              )}

              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status Pills */}
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                    className={statusFilter === 'all' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
                  >
                    Todas ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('valid'); setCurrentPage(1); }}
                    className={statusFilter === 'valid' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
                  >
                    Válidas ({stats.valid})
                  </button>
                  {stats.duplicate > 0 && (
                    <button
                      type="button"
                      onClick={() => { setStatusFilter('duplicate'); setCurrentPage(1); }}
                      className={statusFilter === 'duplicate' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
                    >
                      Duplicadas ({stats.duplicate})
                    </button>
                  )}
                  {stats.errors > 0 && (
                    <button
                      type="button"
                      onClick={() => { setStatusFilter('error'); setCurrentPage(1); }}
                      className={statusFilter === 'error' ? UI_LOCK.filterPillActive : UI_LOCK.filterPillInactive}
                    >
                      Inválidas ({stats.errors})
                    </button>
                  )}

                  {/* Currency Filter Dropdown */}
                  <select
                    value={currencyFilter}
                    onChange={(e) => { setCurrencyFilter(e.target.value); setCurrentPage(1); }}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">Todas las Monedas</option>
                    {activeCurrencyCodes.map((c) => (
                      <option key={c} value={c}>
                        Solo {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => { setSearchFilter(e.target.value); setCurrentPage(1); }}
                      placeholder="Buscar agencia o código..."
                      className="w-56 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Marcar todas
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded Table (Scrollable Container) */}
            <div className="flex-1 overflow-auto p-6 pt-3">
              <div className={UI_LOCK.tableContainer + ' shadow-md'}>
                <table className={UI_LOCK.table}>
                  <thead className={UI_LOCK.tableThead + ' sticky top-0 z-10 shadow-xs'}>
                    <tr>
                      <th className="px-3 py-3.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={stats.selected > 0 && stats.selected === stats.valid}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-3 py-3.5 w-12 text-center text-[10px] text-slate-400">#</th>
                      <th className={UI_LOCK.tableTheadTh}>Nombre de la Agencia *</th>
                      <th className={UI_LOCK.tableTheadTh}>Comisión %</th>
                      <th className={UI_LOCK.tableTheadTh}>Sistema(s)</th>
                      <th className={UI_LOCK.tableTheadTh}>Código / ID en Reporte</th>
                      <th className={UI_LOCK.tableTheadTh}>Usuario</th>
                      <th className={UI_LOCK.tableTheadTh}>Moneda(s)</th>
                      <th className={UI_LOCK.tableTheadTh}>Estado</th>
                      <th className="px-3 py-3.5 w-12 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-12 text-slate-400 text-xs">
                          No se encontraron agencias con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, idx) => {
                        const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                        const isDup = row.status === 'duplicate';
                        const isErr = row.status === 'error';

                        return (
                          <tr
                            key={row.id}
                            className={`${UI_LOCK.tableRow} ${
                              isDup
                                ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                : isErr
                                ? 'bg-rose-50/40 dark:bg-rose-950/20'
                                : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                disabled={isErr}
                                checked={row.selected}
                                onChange={() => handleToggleSelect(row.id)}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                              />
                            </td>

                            {/* Row Number */}
                            <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-400">
                              {globalIdx}
                            </td>

                            {/* Nombre Agencia */}
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.nombre}
                                onChange={(e) => handleUpdateRow(row.id, 'nombre', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 dark:text-white transition-all uppercase"
                              />
                            </td>

                            {/* Comisión % */}
                            <td className="px-3 py-2 w-24">
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={row.comision}
                                  onChange={(e) =>
                                    handleUpdateRow(row.id, 'comision', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 text-right pr-6 transition-all"
                                />
                                <span className="absolute right-2 top-1 text-xs text-slate-400 font-bold">%</span>
                              </div>
                            </td>

                            {/* Sistemas */}
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {row.sistemas.map((s) => (
                                  <span
                                    key={s}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* Código / ID en Reporte */}
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.codigoReporte}
                                onChange={(e) => handleUpdateRow(row.id, 'codigoReporte', e.target.value)}
                                placeholder="Ej: ID o Código en Reporte"
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-cyan-600 dark:text-cyan-400 transition-all"
                              />
                              {row.codigosPorMoneda && Object.keys(row.codigosPorMoneda).length > 1 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {Object.entries(row.codigosPorMoneda).map(([mon, cod]) => (
                                    <span
                                      key={mon}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800"
                                      title={`Código en reporte para ${mon}: ${cod}`}
                                    >
                                      <span className="font-bold">{mon}:</span>
                                      <span>{cod}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Usuario Taquilla */}
                            <td className="px-3 py-2 w-36">
                              <input
                                type="text"
                                value={row.usuarioTaquilla}
                                onChange={(e) => handleUpdateRow(row.id, 'usuarioTaquilla', e.target.value)}
                                placeholder="Usuario POS"
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 transition-all uppercase"
                              />
                            </td>

                            {/* Monedas */}
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {row.monedas.map((m) => {
                                  const isUsd = m.includes('USD') || m.includes('$');
                                  const isCop = m.includes('COP');
                                  const badgeClass = isUsd
                                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                    : isCop
                                    ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20'
                                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';

                                  return (
                                    <span
                                      key={m}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeClass}`}
                                    >
                                      {m}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Estado */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {row.status === 'valid' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Lista
                                </span>
                              )}
                              {row.status === 'duplicate' && (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20"
                                  title={row.errorMessage}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Existe
                                </span>
                              )}
                              {row.status === 'error' && (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20"
                                  title={row.errorMessage}
                                >
                                  <XCircle className="w-3 h-3" />
                                  Error
                                </span>
                              )}
                            </td>

                            {/* Eliminar fila */}
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer"
                                title="Descartar esta fila"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredRows.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Mostrando{' '}
                    <strong>
                      {(currentPage - 1) * pageSize + 1} -{' '}
                      {Math.min(currentPage * pageSize, filteredRows.length)}
                    </strong>{' '}
                    de <strong>{filteredRows.length}</strong> agencias
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span>Filas:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs rounded-lg px-2 py-1"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                        <option value={1000}>Todas</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-mono font-bold px-2">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Progress Indicator */}
            {progress && (
              <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span>Registrando agencias en la base de datos y creando credenciales POS...</span>
                    <span className="font-mono">
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-200"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL FOOTER                                              */}
        {/* ========================================================= */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/80 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {step === 'preview' ? (
              <span>
                Se registrarán <strong>{stats.selected}</strong> agencias con comisión y códigos de reporte, guardando las palabras claves del proveedor.
              </span>
            ) : (
              <span>Sube un archivo Excel/CSV o pega texto para generar la previsualización.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                disabled={isProcessing}
                className={UI_LOCK.buttonSecondary}
              >
                Volver a Cargar
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className={UI_LOCK.buttonSecondary}
            >
              Cancelar
            </button>

            {step === 'preview' && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isProcessing || stats.selected === 0 || isOverQuota}
                className={UI_LOCK.buttonPrimary}
              >
                <Upload className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? `Registrando (${progress?.current || 0}/${progress?.total || 0})...`
                    : `Registrar ${stats.selected} Agencias`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
