import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ALL_MODULES } from '../../utils/formatters';
import type { SubUserAccess, ModuleId } from '../../types';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Save,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';

const AVAILABLE_ROLES = [
  'Empleado',
  'Auditor Interno',
  'Auditor Externo',
  'Contador',
  'Administrador',
  'Gerente',
];

export const UsersTab: React.FC = () => {
  const { effectiveUserId, user, profile, allowedModules } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [subUsers, setSubUsers] = useState<SubUserAccess[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editUserItem, setEditUserItem] = useState<SubUserAccess | null>(null);
  const [deleteUserItem, setDeleteUserItem] = useState<SubUserAccess | null>(null);

  // New User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [newRol, setNewRol] = useState('Empleado');
  const [newAccesos, setNewAccesos] = useState<string[]>(['Inicio']);

  // Edit User Form State
  const [editRol, setEditRol] = useState('Empleado');
  const [editAccesos, setEditAccesos] = useState<string[]>(['Inicio']);

  const loadData = async () => {
    if (!effectiveUserId) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from('usuarios_accesos')
        .select('*')
        .eq('parent_id', effectiveUserId)
        .order('email', { ascending: true });

      if (error) throw error;
      setSubUsers(data || []);
    } catch (err: any) {
      console.error('Error loading sub-users:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al cargar usuarios secundarios.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveUserId]);

  // Filtered sub-users
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return subUsers;
    const q = searchQuery.toLowerCase();
    return subUsers.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.rol || '').toLowerCase().includes(q)
    );
  }, [subUsers, searchQuery]);

  // Modules available to grant (must be within admin's own allowedModules)
  const assignableModules = useMemo<ModuleId[]>(() => {
    return ALL_MODULES.filter((m: ModuleId) => m !== 'Inicio' && allowedModules.includes(m));
  }, [allowedModules]);

  // Open New User Modal
  const handleOpenNew = () => {
    setNewEmail('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setNewRol('Empleado');
    setNewAccesos(['Inicio', 'Pizarra de Confirmaciones', 'Estado de Cuenta']);
    setIsNewModalOpen(true);
  };

  // Submit New Sub-User
  const handleCreateSubUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;

    if (!newEmail.trim() || !newPassword.trim()) {
      setMessage({ type: 'error', text: 'El correo y la contraseña son obligatorios.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    try {
      // 1. Check duplicate in usuarios_accesos
      const { data: existing } = await supabase
        .from('usuarios_accesos')
        .select('id')
        .eq('email', newEmail.trim().toLowerCase());

      if (existing && existing.length > 0) {
        setMessage({ type: 'error', text: 'Este correo ya tiene accesos configurados.' });
        setIsProcessing(false);
        return;
      }

      // 2. Register user in Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: newEmail.trim().toLowerCase(),
        password: newPassword.trim(),
      });

      let subUserId = authData?.user?.id;

      if (authErr && !subUserId) {
        // If user already exists in auth, check if we can link their ID
        const { data: profileCheck } = await supabase
          .from('perfiles')
          .select('id')
          .eq('email', newEmail.trim().toLowerCase())
          .single();

        if (profileCheck) {
          subUserId = profileCheck.id;
        } else {
          throw authErr;
        }
      }

      if (!subUserId) {
        throw new Error('No se pudo generar el identificador de usuario.');
      }

      // 3. Create or update profile
      await supabase.from('perfiles').upsert({
        id: subUserId,
        email: newEmail.trim().toLowerCase(),
        nombre_banca: profile?.nombre_banca || 'Multibanca Express',
        plan: profile?.plan || 'plan_control_maestro',
        status: 'activo',
        role: 'suscriptor_sub',
        rol: newRol.toLowerCase(),
        limite_agencias: profile?.limite_agencias || 5,
      });

      // 4. Insert access matrix in usuarios_accesos
      const finalAccesos = Array.from(new Set(['Inicio', ...newAccesos]));
      const { error: accessErr } = await supabase.from('usuarios_accesos').insert({
        id: subUserId,
        email: newEmail.trim().toLowerCase(),
        parent_id: effectiveUserId,
        rol: newRol,
        accesos: finalAccesos,
      });

      if (accessErr) throw accessErr;

      confetti({ particleCount: 50, spread: 60 });
      setMessage({ type: 'success', text: `¡Usuario ${newEmail} creado con éxito!` });

      setIsNewModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error creating sub-user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al crear el usuario.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (u: SubUserAccess) => {
    setEditUserItem(u);
    setEditRol(u.rol || 'Empleado');
    setEditAccesos(u.accesos || ['Inicio']);
  };

  // Submit Edit Permissions
  const handleSaveEditPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserItem || !effectiveUserId) return;

    setIsProcessing(true);

    try {
      const finalAccesos = Array.from(new Set(['Inicio', ...editAccesos]));

      const { error } = await supabase
        .from('usuarios_accesos')
        .update({
          rol: editRol,
          accesos: finalAccesos,
        })
        .eq('id', editUserItem.id)
        .eq('parent_id', effectiveUserId);

      if (error) throw error;

      setMessage({ type: 'success', text: `Permisos de ${editUserItem.email} actualizados.` });
      setEditUserItem(null);
      await loadData();
    } catch (err: any) {
      console.error('Error updating permissions:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al actualizar permisos.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Sub-User
  const handleDeleteSubUser = async () => {
    if (!deleteUserItem || !effectiveUserId) return;
    setIsProcessing(true);

    try {
      // 1. Delete from usuarios_accesos
      await supabase
        .from('usuarios_accesos')
        .delete()
        .eq('id', deleteUserItem.id)
        .eq('parent_id', effectiveUserId);

      // 2. Deactivate profile
      await supabase
        .from('perfiles')
        .update({ status: 'inactivo' })
        .eq('id', deleteUserItem.id);

      setMessage({ type: 'success', text: `Usuario ${deleteUserItem.email} eliminado.` });
      setDeleteUserItem(null);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting sub-user:', err);
      setMessage({ type: 'error', text: err?.message || 'Error al eliminar el usuario.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users className="w-5 h-5" />
            </span>
            Gestión de Usuarios y Accesos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Administra los usuarios secundarios autorizados para acceder a tu plataforma comercial y personaliza sus permisos por módulo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          <button
            onClick={handleOpenNew}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar usuario por correo o rol..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#0D1B22] border border-slate-800 rounded-2xl pl-9 pr-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* Users List */}
      {isLoading ? (
        <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">Cargando usuarios...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-[#0D1B22] border border-slate-800 rounded-3xl space-y-3">
          <Users className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white">No hay usuarios secundarios registrados</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Puedes crear usuarios secundarios con contraseñas propias y restringir los módulos a los que tienen acceso.
          </p>
          <button
            onClick={handleOpenNew}
            className="px-4 py-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-bold hover:bg-purple-500/30 cursor-pointer transition-all inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Crear Primer Usuario
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => {
            const accList = u.accesos || ['Inicio'];

            return (
              <div
                key={u.id}
                className="bg-[#0D1B22] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white">{u.email}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[10px] font-bold border border-purple-500/30">
                      {u.rol || 'Empleado'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 pt-1">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      Módulos Permitidos ({accList.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {accList.map((m) => (
                        <span
                          key={m}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800 justify-end">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-purple-400" />
                    Permisos
                  </button>

                  <button
                    onClick={() => setDeleteUserItem(u)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-rose-500/20 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Borrar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          NEW SUB-USER MODAL
      ========================================================================= */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-5 shadow-2xl animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" />
                Registrar Nuevo Usuario Secundario
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubUser} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Correo Electrónico (Login) *</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@correo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Contraseña *</label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Confirmar Contraseña *</label>
                  <input
                    type="password"
                    required
                    placeholder="Repita la contraseña"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Rol / Cargo</label>
                <select
                  value={newRol}
                  onChange={(e) => setNewRol(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permission Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300 block">
                  Módulos y Vistas Autorizadas:
                </label>

                <div className="grid grid-cols-2 gap-2 p-3 bg-[#071217] rounded-xl border border-slate-800 max-h-48 overflow-y-auto">
                  {assignableModules.map((m: ModuleId) => {
                    const isChecked = newAccesos.includes(m);
                    return (
                      <label
                        key={m}
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-purple-500/15 text-purple-300 font-semibold'
                            : 'text-slate-400 hover:bg-slate-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setNewAccesos([...newAccesos, m]);
                            else setNewAccesos(newAccesos.filter((item) => item !== m));
                          }}
                          className="rounded text-purple-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span className="truncate">{m}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT PERMISSIONS MODAL
      ========================================================================= */}
      {editUserItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0D1B22] border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-5 shadow-2xl animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-400" />
                  Editar Permisos: {editUserItem.email}
                </h3>
                <p className="text-xs text-slate-400">Actualiza el rol y módulos autorizados.</p>
              </div>
              <button
                onClick={() => setEditUserItem(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditPermissions} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Rol / Cargo</label>
                <select
                  value={editRol}
                  onChange={(e) => setEditRol(e.target.value)}
                  className="w-full bg-[#071217] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permission Checkboxes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300 block">
                  Módulos y Vistas Autorizadas:
                </label>

                <div className="grid grid-cols-2 gap-2 p-3 bg-[#071217] rounded-xl border border-slate-800 max-h-48 overflow-y-auto">
                  {assignableModules.map((m: ModuleId) => {
                    const isChecked = editAccesos.includes(m);
                    return (
                      <label
                        key={m}
                        className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-purple-500/15 text-purple-300 font-semibold'
                            : 'text-slate-400 hover:bg-slate-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setEditAccesos([...editAccesos, m]);
                            else setEditAccesos(editAccesos.filter((item) => item !== m));
                          }}
                          className="rounded text-purple-500 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span className="truncate">{m}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Guardando...' : 'Guardar Permisos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE MODAL
      ========================================================================= */}
      {deleteUserItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1B22] border border-rose-500/30 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">¿Eliminar Usuario?</h3>
                <p className="text-xs text-slate-400">{deleteUserItem.email}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Esta acción revocará todos los accesos del usuario y desactivará su cuenta.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteUserItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteSubUser}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
