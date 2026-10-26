import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { UI_LOCK } from '../../styles/uiDesignLock';
import { cleanAgencyName } from '../../utils/formatters';
import { logAuditEvent } from '../../utils/auditLogger';
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
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface BulkAgencyRow {
  id: string;
  selected: boolean;
  nombre: string;
  comision: number;
  sistemas: string[];
  palabrasClaves: string;
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

  // Mode: 'file' (upload excel/csv) or 'paste' (direct text paste)
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');

  // Fallback / Defaults
  const [defaultComision, setDefaultComision] = useState('10');
  const [defaultParticipacion, setDefaultParticipacion] = useState('50');
  const [defaultSystemMode, setDefaultSystemMode] = useState<string>('ALL'); // 'ALL' or specific system name
  const [defaultClaveTaquilla, setDefaultClaveTaquilla] = useState('1234');

  // Rows and processing
  const [rows, setRows] = useState<BulkAgencyRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

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

  // Statistics
  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter((r) => r.status === 'valid').length;
    const duplicate = rows.filter((r) => r.status === 'duplicate').length;
    const errors = rows.filter((r) => r.status === 'error').length;
    const selected = rows.filter((r) => r.selected && r.status === 'valid').length;
    return { total, valid, duplicate, errors, selected };
  }, [rows]);

  // Filtered rows for UI preview
  const displayedRows = useMemo(() => {
    if (!searchFilter.trim()) return rows;
    const q = searchFilter.toLowerCase();
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        r.palabrasClaves.toLowerCase().includes(q) ||
        r.sistemas.some((s) => s.toLowerCase().includes(q))
    );
  }, [rows, searchFilter]);

  if (!isOpen) return null;

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
      'Palabras Claves / ID Reporte',
      'Moneda',
      'Participacion %',
      'Grupo',
    ];

    const data = [
      headers,
      ['AGENCIA CENTRO 01', 10, sampleSys, 'MAXIMA CUA 02 T2', sampleMon, 50, ''],
      ['AGENCIA PLAZA', 12, sampleSys2, 'ID_PLAZA_01, 502', sampleMon, 50, ''],
      ['AGENCIA LA COROMOTO', 15, activeSystemNames.join(', '), 'chucho@banklot.net, 504', sampleMon, 50, ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws['!cols'] = [
      { wch: 26 }, // Nombre
      { wch: 14 }, // Comision
      { wch: 22 }, // Sistema
      { wch: 32 }, // Palabras Claves
      { wch: 12 }, // Moneda
      { wch: 16 }, // Participacion
      { wch: 20 }, // Grupo
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Agencias');
    XLSX.writeFile(wb, 'plantilla_agencias_nuevas.xlsx');
  };

  // Process raw tabular 2D array into validated rows
  const processRawData = (rawRows: any[][], sourceName = '') => {
    setErrorMsg(null);
    if (!rawRows || rawRows.length < 2) {
      setErrorMsg('El archivo o texto no contiene suficientes filas para procesar.');
      return;
    }

    // Synonyms for header detection
    const NAME_SYNONYMS = ['AGENCIA', 'NOMBRE', 'NOMBRE AGENCIA', 'PUNTO', 'LOCAL', 'NOMBRE_AGENCIA'];
    const COM_SYNONYMS = ['COMISION', 'COMISIÓN', 'COMISION %', 'COM %', '% COMISION', 'PORCENTAJE', 'COM'];
    const SYS_SYNONYMS = ['SISTEMA', 'SISTEMAS', 'PROVEEDOR', 'PLATAFORMA'];
    const KEYWORD_SYNONYMS = [
      'PALABRA CLAVE',
      'PALABRAS CLAVES',
      'PALABRAS_CLAVES',
      'CODIGO',
      'CÓDIGO',
      'ID REPORTE',
      'USUARIO REPORTE',
      'EQUIVALENCIA',
      'EQUIVALENCIAS',
      'ALIAS',
      'ID',
      'KEYWORDS',
    ];
    const MON_SYNONYMS = ['MONEDA', 'MONEDAS', 'DIVISA', 'DIVISAS'];
    const PART_SYNONYMS = ['PARTICIPACION', 'PARTICIPACIÓN', 'PART %', 'PARTICIPACION %'];
    const GRP_SYNONYMS = ['GRUPO', 'INTERMEDIARIO', 'SUBCOMERCIALIZADOR', 'RED'];

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const line = rawRows[i].map((c) => String(c ?? '').trim().toUpperCase()).join(' ');
      if (NAME_SYNONYMS.some((syn) => line.includes(syn))) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) headerRowIdx = 0;

    const headers = rawRows[headerRowIdx].map((c) => String(c ?? '').trim().toUpperCase());

    const colNombre = headers.findIndex((h) => NAME_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colCom = headers.findIndex((h) => COM_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colSys = headers.findIndex((h) => SYS_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colKey = headers.findIndex((h) => KEYWORD_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colMon = headers.findIndex((h) => MON_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colPart = headers.findIndex((h) => PART_SYNONYMS.some((syn) => h === syn || h.includes(syn)));
    const colGrp = headers.findIndex((h) => GRP_SYNONYMS.some((syn) => h === syn || h.includes(syn)));

    const parsed: BulkAgencyRow[] = [];

    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawNombre = String(row[colNombre !== -1 ? colNombre : 0] ?? '').trim();
      if (!rawNombre || rawNombre.toUpperCase().startsWith('TOTAL') || rawNombre.toUpperCase() === 'NAN') {
        continue;
      }

      const cleanNameUpper = rawNombre.toUpperCase();
      const cleanNormalized = cleanAgencyName(cleanNameUpper);

      // Comisión
      let comVal = Number(defaultComision) || 10;
      if (colCom !== -1 && row[colCom] !== undefined && String(row[colCom]).trim() !== '') {
        const parsedCom = parseFloat(String(row[colCom]).replace('%', '').replace(',', '.').trim());
        if (!isNaN(parsedCom) && parsedCom >= 0) {
          comVal = parsedCom;
        }
      }

      // Participación
      let partVal = Number(defaultParticipacion) || 50;
      if (colPart !== -1 && row[colPart] !== undefined && String(row[colPart]).trim() !== '') {
        const parsedPart = parseFloat(String(row[colPart]).replace('%', '').replace(',', '.').trim());
        if (!isNaN(parsedPart) && parsedPart >= 0) {
          partVal = parsedPart;
        }
      }

      // Sistemas
      let assignedSystems: string[] = [];
      if (colSys !== -1 && row[colSys] !== undefined && String(row[colSys]).trim() !== '') {
        const rawSysCell = String(row[colSys]);
        const splitted = rawSysCell
          .split(/[,;\/|]/)
          .map((s) => s.trim())
          .filter(Boolean);

        // Match against active systems loosely
        splitted.forEach((item) => {
          const match = systems.find(
            (sys) => sys.nombre_sistema.trim().toUpperCase() === item.toUpperCase()
          );
          if (match) {
            assignedSystems.push(match.nombre_sistema.trim());
          } else {
            assignedSystems.push(item.toUpperCase());
          }
        });
      }

      if (assignedSystems.length === 0) {
        if (defaultSystemMode === 'ALL') {
          assignedSystems = activeSystemNames.length > 0 ? [...activeSystemNames] : ['GENERAL'];
        } else {
          assignedSystems = [defaultSystemMode];
        }
      }

      // Palabras Claves / Códigos de Reporte
      let palabrasClaves = '';
      if (colKey !== -1 && row[colKey] !== undefined) {
        palabrasClaves = String(row[colKey]).trim();
      }

      // Monedas
      let assignedCurrencies: string[] = [];
      if (colMon !== -1 && row[colMon] !== undefined && String(row[colMon]).trim() !== '') {
        const rawMonCell = String(row[colMon]);
        const splitted = rawMonCell
          .split(/[,;\/|]/)
          .map((m) => m.trim().toUpperCase())
          .filter(Boolean);

        splitted.forEach((m) => {
          if (activeCurrencyCodes.includes(m)) {
            assignedCurrencies.push(m);
          }
        });
      }

      if (assignedCurrencies.length === 0) {
        assignedCurrencies = activeCurrencyCodes.length > 0 ? [...activeCurrencyCodes] : ['USD'];
      }

      // Grupo
      let grupoId: number | null = null;
      let grupoNombre = '';
      if (colGrp !== -1 && row[colGrp] !== undefined && String(row[colGrp]).trim() !== '') {
        const rawGrp = String(row[colGrp]).trim().toUpperCase();
        const matchedGrp = groups.find(
          (g) => g.nombre_grupo.trim().toUpperCase() === rawGrp
        );
        if (matchedGrp) {
          grupoId = matchedGrp.id;
          grupoNombre = matchedGrp.nombre_grupo;
        }
      }

      // Duplicate Check
      let status: 'valid' | 'duplicate' | 'error' = 'valid';
      let errorMessage: string | undefined = undefined;

      if (!cleanNormalized) {
        status = 'error';
        errorMessage = 'Nombre de agencia inválido';
      } else if (existingAgenciesSet.has(cleanNormalized)) {
        status = 'duplicate';
        errorMessage = 'La agencia ya existe en tu catálogo';
      }

      parsed.push({
        id: `row_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        selected: status === 'valid',
        nombre: cleanNameUpper,
        comision: comVal,
        sistemas: Array.from(new Set(assignedSystems)),
        palabrasClaves,
        monedas: Array.from(new Set(assignedCurrencies)),
        participacion: partVal,
        grupoId,
        grupoNombre,
        status,
        errorMessage,
      });
    }

    if (parsed.length === 0) {
      setErrorMsg('No se detectaron registros válidos en las filas procesadas.');
      return;
    }

    setRows(parsed);
    setFileName(sourceName);
  };

  // File Upload Handler (Excel/CSV)
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
        processRawData(rawRows, file.name);
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

    // Split each line by tab or comma or semicolon
    const rawRows = lines.map((line) => {
      if (line.includes('\t')) return line.split('\t');
      if (line.includes(';')) return line.split(';');
      return line.split(',');
    });

    // If first row doesn't look like headers, synthesize header row using defaults
    const firstLineUpper = lines[0].toUpperCase();
    const hasHeaderSignature =
      firstLineUpper.includes('AGENCIA') ||
      firstLineUpper.includes('NOMBRE') ||
      firstLineUpper.includes('COMISION') ||
      firstLineUpper.includes('SISTEMA') ||
      firstLineUpper.includes('CODIGO');

    let finalRows = rawRows;
    if (!hasHeaderSignature) {
      const synthHeaders = [
        'Nombre Agencia',
        'Comision %',
        'Sistema',
        'Palabras Claves / ID Reporte',
      ];
      finalRows = [synthHeaders, ...rawRows];
    }

    processRawData(finalRows, 'Texto Copiado');
  };

  // Update a single field in parsed rows
  const handleUpdateRow = (index: number, field: keyof BulkAgencyRow, val: any) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[index], [field]: val };

      if (field === 'nombre') {
        const clean = cleanAgencyName(String(val).toUpperCase());
        if (!clean) {
          r.status = 'error';
          r.errorMessage = 'Nombre vacío';
        } else if (existingAgenciesSet.has(clean)) {
          r.status = 'duplicate';
          r.errorMessage = 'La agencia ya existe';
        } else {
          r.status = 'valid';
          r.errorMessage = undefined;
        }
      }

      next[index] = r;
      return next;
    });
  };

  // Remove a row
  const handleRemoveRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Toggle selection
  const handleToggleSelect = (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[index].selected = !next[index].selected;
      return next;
    });
  };

  // Select / Deselect All Valid
  const handleToggleSelectAll = (select: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.status === 'valid' ? { ...r, selected: select } : r))
    );
  };

  // Save Bulk Agencies
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
            const entry: any = {
              sistema: sys,
              moneda: mon,
              comision: Number(row.comision),
              participacion: Number(row.participacion),
            };
            if (row.palabrasClaves.trim()) {
              entry.codigo = row.palabrasClaves.trim();
            }
            condicionesObj[comboKey] = entry;
            if (!condicionesObj[sys]) {
              condicionesObj[sys] = entry;
            }
          });
        });

        // Unique username for cashier POS
        const cleanSlug = cleanAgencyName(row.nombre)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .slice(0, 16);
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const taquillaUser = `${cleanSlug || 'agencia'}_${randomSuffix}_pos`;
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

        // Insert agency with resilient fallback if grupo columns don't exist
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
        descripcion: `Carga masiva completada: ${insertedCount} nuevas agencias registradas con comisiones, sistemas y palabras claves.`,
        impacto_financiero: 'MEDIO',
        semana_ciclo: String(systemCycle?.semana || ''),
        ciclo_periodo:
          systemCycle?.desde && systemCycle?.hasta
            ? `${systemCycle.desde} al ${systemCycle.hasta}`
            : undefined,
      });

      confetti({ particleCount: 75, spread: 80 });
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

  return (
    <div className={UI_LOCK.modalBackdrop}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 animate-fade-in">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className={UI_LOCK.headerIconWrap}>
              <Upload className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Carga Masiva de Agencias</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Excel / CSV / Texto
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Registra múltiples agencias con su comisión, sistema y palabras claves / códigos en reporte para conciliación automática.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Descargar plantilla oficial para rellenar en Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Plantilla Excel</span>
            </button>

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

        {/* Modal Body (Scrollable) */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
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

            {isOverQuota && (
              <div className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Superas el cupo disponible</span>
              </div>
            )}
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
                <div className="relative">
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
          </div>

          {/* Mode Tabs: File Upload vs Direct Text Paste */}
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

          {/* Tab 1: File Dropzone */}
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
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-400 rounded-3xl p-8 sm:p-10 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 hover:bg-emerald-500/5 transition-all group"
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {fileName ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                      Archivo cargado: {fileName}
                    </span>
                  ) : (
                    'Haz clic o arrastra aquí tu archivo Excel (.xlsx, .xls) o CSV (.csv)'
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Columnas admitidas: <strong>Nombre Agencia</strong>, <strong>Comisión %</strong>, <strong>Sistema</strong>, <strong>Palabras Claves / ID Reporte</strong>, Moneda, Participación %.
                </p>
              </div>
            </div>
          )}

          {/* Tab 2: Paste Direct Text */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Pega las celdas copiadas directamente de Excel o Google Sheets:</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Formato tabular separado por tabulador o coma
                </span>
              </label>
              <textarea
                rows={5}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`AGENCIA CENTRO 01\t10\tBETM3\tMAXIMA CUA 02 T2\nAGENCIA PLAZA\t12\tCDAPUESTAS\tID_PLAZA_01, 502\nAGENCIA EL TREBOL\t15\tGATOWEB\tchucho@banklot.net`}
                className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-2xl p-3.5 text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  className={UI_LOCK.buttonPrimary + ' text-xs'}
                >
                  <Sparkles className="w-4 h-4" />
                  Interpretar Filas Pegadas
                </button>
              </div>
            </div>
          )}

          {/* Error Message Banner */}
          {errorMsg && (
            <div className={UI_LOCK.errorBanner}>
              <XCircle className="w-5 h-5 shrink-0" />
              <div className="text-xs font-semibold">{errorMsg}</div>
            </div>
          )}

          {/* Interactive Preview Table */}
          {rows.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Table Toolbar & Stats */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Previsualización de Agencias ({rows.length}):
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20">
                    {stats.selected} seleccionadas
                  </span>
                  {stats.duplicate > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                      {stats.duplicate} ya existen
                    </span>
                  )}
                  {stats.errors > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20">
                      {stats.errors} con error
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filtrar en la tabla..."
                    className="w-44 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    Deseleccionar
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className={UI_LOCK.tableContainer + ' max-h-72 overflow-y-auto'}>
                <table className={UI_LOCK.table}>
                  <thead className={UI_LOCK.tableThead}>
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={stats.selected > 0 && stats.selected === stats.valid}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                      <th className={UI_LOCK.tableTheadTh}>Nombre de la Agencia *</th>
                      <th className={UI_LOCK.tableTheadTh}>Comisión %</th>
                      <th className={UI_LOCK.tableTheadTh}>Sistema(s)</th>
                      <th className={UI_LOCK.tableTheadTh}>Palabras Claves / ID Reporte</th>
                      <th className={UI_LOCK.tableTheadTh}>Monedas</th>
                      <th className={UI_LOCK.tableTheadTh}>Estado</th>
                      <th className="px-3 py-3 w-12 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((row, idx) => {
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
                              onChange={() => handleToggleSelect(idx)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                            />
                          </td>

                          {/* Nombre */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.nombre}
                              onChange={(e) => handleUpdateRow(idx, 'nombre', e.target.value)}
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
                                  handleUpdateRow(idx, 'comision', parseFloat(e.target.value) || 0)
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

                          {/* Palabras Claves / ID Reporte */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.palabrasClaves}
                              onChange={(e) => handleUpdateRow(idx, 'palabrasClaves', e.target.value)}
                              placeholder="Ej: MAXIMA CUA 02, 502"
                              className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-cyan-600 dark:text-cyan-400 transition-all"
                            />
                          </td>

                          {/* Monedas */}
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {row.monedas.map((m) => (
                                <span
                                  key={m}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.status === 'valid' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                Válida
                              </span>
                            )}
                            {row.status === 'duplicate' && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20"
                                title={row.errorMessage}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Ya existe
                              </span>
                            )}
                            {row.status === 'error' && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20"
                                title={row.errorMessage}
                              >
                                <XCircle className="w-3 h-3" />
                                Inválida
                              </span>
                            )}
                          </td>

                          {/* Eliminar fila */}
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all cursor-pointer"
                              title="Descartar esta fila"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          {progress && (
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {stats.selected > 0 ? (
              <span>
                Se registrarán <strong>{stats.selected}</strong> agencias nuevas en tu operadora.
              </span>
            ) : (
              <span>Carga un archivo o pega filas para comenzar.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className={UI_LOCK.buttonSecondary}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isProcessing || stats.selected === 0 || isOverQuota}
              className={UI_LOCK.buttonPrimary}
            >
              <Upload className="w-4 h-4" />
              <span>
                {isProcessing
                  ? 'Registrando...'
                  : `Registrar ${stats.selected} Agencias`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
