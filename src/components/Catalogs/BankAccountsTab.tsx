import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { BankAccount, PaymentDevice, Agency } from '../../types';
import {
  Landmark,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { formatCurrency, normalizarMoneda } from '../../utils/formatters';

export const BankAccountsTab: React.FC = () => {
  const { effectiveUserId } = useAuth();
  const [subTab, setSubTab] = useState<'cuentas' | 'dispositivos'>('cuentas');

  // Accounts state
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [devices, setDevices] = useState<PaymentDevice[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);

  // Form Account State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [banco, setBanco] = useState('');
  const [titular, setTitular] = useState('');
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [moneda, setMoneda] = useState('BS');
  const [tipoCuenta, setTipoCuenta] = useState('CORRIENTE');
  const [agenciaAsignada, setAgenciaAsignada] = useState('TODAS');
  const [saldoInicial, setSaldoInicial] = useState<number | ''>(0);
  const [savingAccount, setSavingAccount] = useState(false);

  // Form Device State
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [aliasNombre, setAliasNombre] = useState('');
  const [tipoDispositivo, setTipoDispositivo] = useState('PUNTO DE VENTA (POS)');
  const [serialTid, setSerialTid] = useState('');
  const [cuentaAsociada, setCuentaAsociada] = useState('PRINCIPAL');
  const [deviceAgencia, setDeviceAgencia] = useState('TODAS');
  const [deviceMoneda, setDeviceMoneda] = useState('BS');
  const [deviceNotas, setDeviceNotas] = useState('');
  const [savingDevice, setSavingDevice] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);

    try {
      // 1. Cuentas bancarias
      const { data: cbData } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('user_id', effectiveUserId);

      const allCb = cbData || [];
      const pureAccounts = allCb.filter((c: any) => String(c.tipo_cuenta || '').toUpperCase() !== 'DISPOSITIVO DE PAGO');
      setAccounts(pureAccounts as BankAccount[]);

      // 2. Dispositivos (desde dispositivos_pago o cuentas_bancarias fallback)
      let parsedDevices: PaymentDevice[] = [];
      try {
        const { data: dispData } = await supabase
          .from('dispositivos_pago')
          .select('*')
          .eq('user_id', effectiveUserId);
        if (dispData && dispData.length > 0) {
          parsedDevices = dispData.map((d: any) => ({
            id: Number(d.id),
            alias_nombre: d.alias_nombre || d.nombre_dispositivo || 'POS',
            tipo_dispositivo: d.tipo_dispositivo || 'PUNTO DE VENTA (POS)',
            serial_tid: d.serial_tid || d.serial || 'S/N',
            cuenta_asociada: d.cuenta_asociada || 'PRINCIPAL',
            agencia_asignada: d.agencia_asignada || 'TODAS',
            moneda: d.moneda || 'BS',
            estatus: d.estatus || 'ACTIVO',
            notas: d.notas || '',
            user_id: d.user_id,
          }));
        }
      } catch (e) {
        console.warn('dispositivos_pago fetch err:', e);
      }

      // Fallback a cuentas con tipo DISPOSITIVO DE PAGO
      allCb
        .filter((c: any) => String(c.tipo_cuenta || '').toUpperCase() === 'DISPOSITIVO DE PAGO')
        .forEach((d: any) => {
          if (!parsedDevices.some((pd) => pd.id === Number(d.id))) {
            parsedDevices.push({
              id: Number(d.id),
              alias_nombre: d.titular || d.banco || 'POS TAQUILLA',
              tipo_dispositivo: String(d.banco || 'POS').replace('DISPOSITIVO: ', ''),
              serial_tid: d.numero_cuenta || 'S/N',
              cuenta_asociada: d.documento_titular || 'PRINCIPAL',
              agencia_asignada: d.agencia_asignada || 'TODAS',
              moneda: d.moneda || 'BS',
              estatus: d.estatus || 'ACTIVO',
              notas: d.notas || '',
              user_id: d.user_id,
            });
          }
        });

      setDevices(parsedDevices);

      // 3. Agencias para selector
      const { data: agData } = await supabase
        .from('agencias')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('id', { ascending: true });

      setAgencies((agData || []) as Agency[]);
    } catch (err: any) {
      console.error('Error loading bank data:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync agency cuentas_asignadas helper
  const syncAgencyAccounts = async (agencyName: string) => {
    if (!agencyName || ['TODAS', 'GENERAL', 'DISPONIBLE'].includes(agencyName.toUpperCase())) return;
    try {
      const { data: resCb } = await supabase.from('cuentas_bancarias').select('id, banco').eq('user_id', effectiveUserId);
      const { data: resDisp } = await supabase.from('dispositivos_pago').select('id, tipo_dispositivo').eq('user_id', effectiveUserId);

      const items: string[] = [];
      (resCb || []).forEach((c: any) => {
        if (String(c.agencia_asignada || '').toUpperCase() === agencyName.toUpperCase()) {
          items.push(`${c.id} - ${c.banco}`);
        }
      });
      (resDisp || []).forEach((d: any) => {
        if (String(d.agencia_asignada || '').toUpperCase() === agencyName.toUpperCase()) {
          items.push(`${d.id} - ${d.tipo_dispositivo}`);
        }
      });

      await supabase
        .from('agencias')
        .update({ cuentas_asignadas: items.join(',') })
        .ilike('nombre_agencia', agencyName.trim())
        .eq('user_id', effectiveUserId);
    } catch (e) {
      console.warn('Sync error:', e);
    }
  };

  // --- SAVE BANK ACCOUNT ---
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banco.trim() || !titular.trim() || !numeroCuenta.trim()) {
      setFeedback({ type: 'error', message: 'Por favor complete todos los campos obligatorios.' });
      return;
    }

    setSavingAccount(true);
    setFeedback(null);

    const payload = {
      banco: banco.trim().toUpperCase(),
      titular: titular.trim().toUpperCase(),
      numero_cuenta: numeroCuenta.trim(),
      moneda: normalizarMoneda(moneda),
      tipo_cuenta: tipoCuenta.trim().toUpperCase(),
      agencia_asignada: agenciaAsignada.trim().toUpperCase(),
      saldo_inicial: typeof saldoInicial === 'number' ? saldoInicial : 0,
      estatus: 'ACTIVA',
      user_id: effectiveUserId,
    };

    try {
      if (editingAccountId) {
        const { error } = await supabase
          .from('cuentas_bancarias')
          .update(payload)
          .eq('id', editingAccountId)
          .eq('user_id', effectiveUserId);
        if (error) throw error;
        setFeedback({ type: 'success', message: 'Cuenta bancaria actualizada con éxito.' });
      } else {
        const { error } = await supabase.from('cuentas_bancarias').insert(payload);
        if (error) throw error;
        setFeedback({ type: 'success', message: 'Cuenta bancaria registrada con éxito.' });
      }

      await syncAgencyAccounts(agenciaAsignada);
      setShowAccountModal(false);
      resetAccountForm();
      fetchData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error al guardar cuenta.' });
    } finally {
      setSavingAccount(false);
    }
  };

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setBanco('');
    setTitular('');
    setNumeroCuenta('');
    setMoneda('BS');
    setTipoCuenta('CORRIENTE');
    setAgenciaAsignada('TODAS');
    setSaldoInicial(0);
  };

  const handleEditAccount = (acc: BankAccount) => {
    setEditingAccountId(acc.id);
    setBanco(acc.banco);
    setTitular(acc.titular);
    setNumeroCuenta(acc.numero_cuenta);
    setMoneda(acc.moneda);
    setTipoCuenta(acc.tipo_cuenta || 'CORRIENTE');
    setAgenciaAsignada(acc.agencia_asignada || 'TODAS');
    setSaldoInicial(acc.saldo_inicial || 0);
    setShowAccountModal(true);
  };

  const handleDeleteAccount = async (id: number, bName: string) => {
    if (!window.confirm(`¿Está seguro de eliminar la cuenta de '${bName}'?`)) return;
    try {
      const { error } = await supabase
        .from('cuentas_bancarias')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId);
      if (error) throw error;
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setFeedback({ type: 'success', message: `Cuenta '${bName}' eliminada.` });
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message}`);
    }
  };

  // --- SAVE PAYMENT DEVICE ---
  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliasNombre.trim() || !serialTid.trim()) {
      setFeedback({ type: 'error', message: 'Por favor complete alias y serial/TID.' });
      return;
    }

    setSavingDevice(true);
    setFeedback(null);

    const payload = {
      alias_nombre: aliasNombre.trim().toUpperCase(),
      tipo_dispositivo: tipoDispositivo.trim().toUpperCase(),
      serial_tid: serialTid.trim(),
      cuenta_asociada: cuentaAsociada.trim(),
      agencia_asignada: deviceAgencia.trim().toUpperCase(),
      moneda: normalizarMoneda(deviceMoneda),
      estatus: 'ACTIVO',
      notas: deviceNotas.trim(),
      user_id: effectiveUserId,
    };

    try {
      if (editingDeviceId) {
        const { error } = await supabase
          .from('dispositivos_pago')
          .update(payload)
          .eq('id', editingDeviceId)
          .eq('user_id', effectiveUserId);
        if (error) throw error;
        setFeedback({ type: 'success', message: 'Dispositivo actualizado con éxito.' });
      } else {
        const { error } = await supabase.from('dispositivos_pago').insert(payload);
        if (error) throw error;
        setFeedback({ type: 'success', message: 'Dispositivo registrado con éxito.' });
      }

      await syncAgencyAccounts(deviceAgencia);
      setShowDeviceModal(false);
      resetDeviceForm();
      fetchData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error al guardar dispositivo.' });
    } finally {
      setSavingDevice(false);
    }
  };

  const resetDeviceForm = () => {
    setEditingDeviceId(null);
    setAliasNombre('');
    setTipoDispositivo('PUNTO DE VENTA (POS)');
    setSerialTid('');
    setCuentaAsociada('PRINCIPAL');
    setDeviceAgencia('TODAS');
    setDeviceMoneda('BS');
    setDeviceNotas('');
  };

  const handleEditDevice = (dev: PaymentDevice) => {
    setEditingDeviceId(dev.id);
    setAliasNombre(dev.alias_nombre || dev.nombre_dispositivo || dev.alias || '');
    setTipoDispositivo(dev.tipo_dispositivo || 'POS');
    setSerialTid(dev.serial_tid || '');
    setCuentaAsociada(dev.cuenta_asociada || 'PRINCIPAL');
    setDeviceAgencia(dev.agencia_asignada || 'TODAS');
    setDeviceMoneda(dev.moneda || 'BS');
    setDeviceNotas(dev.notas || '');
    setShowDeviceModal(true);
  };

  const handleDeleteDevice = async (id: number, aName: string) => {
    if (!window.confirm(`¿Está seguro de eliminar el dispositivo '${aName}'?`)) return;
    try {
      const { error } = await supabase
        .from('dispositivos_pago')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId);
      if (error) throw error;
      setDevices((prev) => prev.filter((d) => d.id !== id));
      setFeedback({ type: 'success', message: `Dispositivo '${aName}' eliminado.` });
    } catch (err: any) {
      alert(`Error al eliminar: ${err?.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Subtabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-400" />
            <span>Cuentas Bancarias y Puntos de Venta (POS)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Administración de cuentas bancarias de la operadora y dispositivos de cobro asignados a taquillas.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Subtab Navigation Pills */}
      <div className="flex items-center gap-2 bg-[#0D1B22] p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button
          onClick={() => setSubTab('cuentas')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            subTab === 'cuentas'
              ? 'bg-emerald-500 text-black shadow-md font-extrabold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Cuentas Bancarias ({accounts.length})</span>
        </button>

        <button
          onClick={() => setSubTab('dispositivos')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            subTab === 'dispositivos'
              ? 'bg-emerald-500 text-black shadow-md font-extrabold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Dispositivos POS / BioPago ({devices.length})</span>
        </button>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================================================= */}
      {/* SUBTAB 1: CUENTAS BANCARIAS                             */}
      {/* ======================================================= */}
      {subTab === 'cuentas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
              Cuentas Registradas ({accounts.length})
            </h3>
            <button
              onClick={() => { resetAccountForm(); setShowAccountModal(true); }}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>NUEVA CUENTA</span>
            </button>
          </div>

          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                    <th className="py-3 px-3 w-16">ID</th>
                    <th className="py-3 px-4">Banco / Entidad</th>
                    <th className="py-3 px-4">Titular</th>
                    <th className="py-3 px-4">N° Cuenta / Identificador</th>
                    <th className="py-3 px-3 text-center">Moneda</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Agencia Asignada</th>
                    <th className="py-3 px-4 text-right">Saldo Inicial</th>
                    <th className="py-3 px-3 text-center">Estatus</th>
                    <th className="py-3 px-4 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {accounts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500 font-medium">
                        No hay cuentas bancarias registradas.
                      </td>
                    </tr>
                  ) : (
                    accounts.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 font-mono text-slate-400">#{a.id}</td>
                        <td className="py-3 px-4 font-bold text-white">{a.banco}</td>
                        <td className="py-3 px-4 text-slate-300">{a.titular}</td>
                        <td className="py-3 px-4 font-mono text-sky-400">{a.numero_cuenta}</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-200">{a.moneda}</td>
                        <td className="py-3 px-4 text-slate-400">{a.tipo_cuenta || 'CORRIENTE'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold text-[11px]">
                            {a.agencia_asignada || 'TODAS'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {formatCurrency(a.saldo_inicial || 0, a.moneda)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                            {a.estatus || 'ACTIVA'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => handleEditAccount(a)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteAccount(a.id, a.banco)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* SUBTAB 2: DISPOSITIVOS (POS / BIOPAGO)                  */}
      {/* ======================================================= */}
      {subTab === 'dispositivos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
              Dispositivos de Cobro ({devices.length})
            </h3>
            <button
              onClick={() => { resetDeviceForm(); setShowDeviceModal(true); }}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>NUEVO DISPOSITIVO</span>
            </button>
          </div>

          <div className="bg-[#0D1B22] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#071217] text-slate-400 font-bold uppercase text-[11px]">
                    <th className="py-3 px-3 w-16">ID</th>
                    <th className="py-3 px-4">Alias / Nombre</th>
                    <th className="py-3 px-4">Tipo Dispositivo</th>
                    <th className="py-3 px-4">Serial / TID</th>
                    <th className="py-3 px-4">Cuenta Asociada</th>
                    <th className="py-3 px-4">Agencia Asignada</th>
                    <th className="py-3 px-3 text-center">Moneda</th>
                    <th className="py-3 px-3 text-center">Estatus</th>
                    <th className="py-3 px-4 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {devices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
                        No hay dispositivos de cobro registrados.
                      </td>
                    </tr>
                  ) : (
                    devices.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 font-mono text-slate-400">#{d.id}</td>
                        <td className="py-3 px-4 font-bold text-white">{d.alias_nombre}</td>
                        <td className="py-3 px-4 text-slate-300">{d.tipo_dispositivo}</td>
                        <td className="py-3 px-4 font-mono font-bold text-sky-400">{d.serial_tid}</td>
                        <td className="py-3 px-4 text-slate-400">{d.cuenta_asociada || 'PRINCIPAL'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold text-[11px]">
                            {d.agencia_asignada || 'TODAS'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-200">{d.moneda}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                            {d.estatus || 'ACTIVO'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => handleEditDevice(d)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDevice(d.id, d.alias_nombre || d.nombre_dispositivo || d.alias || 'POS')}
                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ACCOUNT */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-400" />
                <span>{editingAccountId ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}</span>
              </h3>
              <button onClick={() => setShowAccountModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Banco / Entidad *</label>
                  <input
                    type="text"
                    value={banco}
                    onChange={(e) => setBanco(e.target.value)}
                    required
                    placeholder="Ej: BANESCO, MERCANTIL"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Moneda *</label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="BS">Bolívares (BS)</option>
                    <option value="USD">Dólares (USD)</option>
                    <option value="COP">Pesos (COP)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Titular de la Cuenta *</label>
                <input
                  type="text"
                  value={titular}
                  onChange={(e) => setTitular(e.target.value)}
                  required
                  placeholder="Nombre o Razón Social"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Número de Cuenta / Teléfono / Email *</label>
                <input
                  type="text"
                  value={numeroCuenta}
                  onChange={(e) => setNumeroCuenta(e.target.value)}
                  required
                  placeholder="0134... / 0414... (Pago Móvil) / Zelle"
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Tipo de Cuenta</label>
                  <select
                    value={tipoCuenta}
                    onChange={(e) => setTipoCuenta(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="CORRIENTE">Corriente</option>
                    <option value="AHORROS">Ahorros</option>
                    <option value="PAGO MÓVIL">Pago Móvil</option>
                    <option value="ZELLE">Zelle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Agencia Asignada</label>
                  <select
                    value={agenciaAsignada}
                    onChange={(e) => setAgenciaAsignada(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="TODAS">TODAS (General)</option>
                    {agencies.map((ag) => (
                      <option key={ag.id} value={ag.nombre_agencia}>
                        {ag.nombre_agencia}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Saldo Inicial</label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {savingAccount ? 'Guardando...' : editingAccountId ? 'ACTUALIZAR' : 'REGISTRAR CUENTA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT DEVICE */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>{editingDeviceId ? 'Editar Dispositivo POS' : 'Nuevo Dispositivo POS / BioPago'}</span>
              </h3>
              <button onClick={() => setShowDeviceModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Alias / Identificador *</label>
                  <input
                    type="text"
                    value={aliasNombre}
                    onChange={(e) => setAliasNombre(e.target.value)}
                    required
                    placeholder="Ej: POS BANESCO 01"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Tipo Dispositivo *</label>
                  <select
                    value={tipoDispositivo}
                    onChange={(e) => setTipoDispositivo(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PUNTO DE VENTA (POS)">PUNTO DE VENTA (POS)</option>
                    <option value="BIOPAGO BDV">BIOPAGO BDV</option>
                    <option value="QR DINÁMICO">QR DINÁMICO</option>
                    <option value="DATÁFONO">DATÁFONO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Serial / TID *</label>
                  <input
                    type="text"
                    value={serialTid}
                    onChange={(e) => setSerialTid(e.target.value)}
                    required
                    placeholder="TID-987654 / Serial"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Moneda Cobro</label>
                  <select
                    value={deviceMoneda}
                    onChange={(e) => setDeviceMoneda(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="BS">Bolívares (BS)</option>
                    <option value="USD">Dólares (USD)</option>
                    <option value="COP">Pesos (COP)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Cuenta Banco Asociada</label>
                  <input
                    type="text"
                    value={cuentaAsociada}
                    onChange={(e) => setCuentaAsociada(e.target.value)}
                    placeholder="Ej: BANESCO PRINCIPAL"
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Agencia Asignada</label>
                  <select
                    value={deviceAgencia}
                    onChange={(e) => setDeviceAgencia(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="TODAS">TODAS (General)</option>
                    {agencies.map((ag) => (
                      <option key={ag.id} value={ag.nombre_agencia}>
                        {ag.nombre_agencia}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Notas / Observaciones</label>
                <textarea
                  value={deviceNotas}
                  onChange={(e) => setDeviceNotas(e.target.value)}
                  rows={2}
                  placeholder="Ubicación física, operadora SIM, etc."
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDevice}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {savingDevice ? 'Guardando...' : editingDeviceId ? 'ACTUALIZAR' : 'REGISTRAR POS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
