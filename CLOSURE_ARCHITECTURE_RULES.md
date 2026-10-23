# Reglas de Arquitectura y Bloqueo de Regresiones (Centro de Cierre)
# ARCHITECTURAL GUARDRAILS & CLOSURE SUITE LOCK

> **ATENCIÓN IA / DESARROLLADOR (CRITICAL GUARDRAIL):**  
> Este repositorio cuenta con un **Núcleo Contable Puro e Inmutable**.  
> Cualquier alteración en las fórmulas contables provocará el fallo inmediato de `npm run build`.

---

### 1. Archivos Protegidos del Núcleo Contable (`@CRITICAL-LOCK`)
Los siguientes archivos forman el núcleo financiero y **NO** deben ser modificados sin ejecutar previamente y con éxito la suite de integridad:
- `src/lib/closureEngineLock.ts` (Motor contable puro de agencias y totales consolidados)
- `src/utils/operatorSettlement.ts` (Motor de liquidación financiera de casas operadoras)
- `src/lib/snapshots.ts` (Persistencia dual inmutable y hash SHA-256)
- `src/utils/semana41SalesData.ts` (Ventas oficiales auditadas de la Semana 41)
- `scripts/verify-closure-integrity.mjs` (Golden Test automatizado)

---

### 2. Invariantes Matemáticas Inviolables
1. **Fórmula Maestra de Saldo Final:**  
   `Saldo Final = Arrastre Anterior + Venta Neta - Gastos Agencias - Cobros (Efectivo + Bancos) + Reposición de Premios`
2. **Prohibición Absoluta de Duplicidad de Efectivo:**  
   Las entregas de efectivo (`isEfectivoPayment`) **JAMÁS** deben sumarse en cuentas bancarias ni en el Acta 41-04 / 41-06.
3. **Paridad Estricta de Actas con la Matriz General:**  
   - Total de Bancos en Matriz General (Acta 41-01) $\equiv$ Total de Bancos en Acta Bancaria (Acta 41-04).
   - Total de Gastos en Matriz General (Acta 41-01) $\equiv$ Total de Gastos en Acta de Gastos (Acta 41-02).
   - Movimientos solo son computables si cumplen: `Boolean(confirmado) && inCycle && !rechazado`.
4. **Valores Congelados Semana 41:**
   - **BS:** Saldo Final = `96,296.82 Bs.`, Bancos = `549,185.20 Bs.`, Gastos Agencia = `16,000.00 Bs.`, Gastos Comercializadora = `25,000.00 Bs.`, Venta Neta = `564,603.10 Bs.`, Arrastre = `96,878.92 Bs.`.
   - **USD:** Saldo Final = `33.34 USD`, Efectivo Taquilla = `992.56 USD`, Bancos Auditados = `95.00 USD` (prohibido que dé `1,087.56 USD` por duplicidad de efectivo).
   - **COP:** Saldo Final = `972,520.00 COP`, Venta Neta Conciliada = `1,490,593.00 COP`, Bancos Conciliados = `1,010,143.00 COP`, Gastos Agencia = `462,000.00 COP`, Saldo Final `MAXIMA CDA 02 T2` = `0.00 COP`.
   - **Casas Operadoras:** `BETM3` BS = `288,134.20 Bs.`, `BETM3` USD = `86.27 USD`, `BETM3` COP = `0.00 COP`, `CDAPUESTAS` USD = `0.00 USD`.

---

### 3. Protocolo Obligatorio para Antigravity y Agentes IA
Antes de dar por completada cualquier tarea o modificación que toque componentes de finanzas, es **obligatorio** ejecutar en la terminal:
```bash
npm run test:closure
```
Y verificar que la compilación global termine exitosa:
```bash
Si el test falla en rojo, la IA debe revertir el cambio de inmediato y reportar la discrepancia.

---

### 4. Ley Permanente e Inmutable de Diseño Visual (UI Design Lock)
1. **Orden del Menú Lateral Intocable (22 Menús en este orden exacto):**
   1. `Inicio` (HomeDashboard.tsx)
   2. `Confirmaciones` (ConfirmationsQuick.tsx)
   3. `Confirmados` (ConfirmationsReport.tsx)
   4. `Sistemas` (SystemsTab.tsx)
   5. `Monedas` (CurrenciesTab.tsx)
   6. `Cuentas Bancarias` (BankAccountsTab.tsx)
   7. `Agencias` (AgenciesTab.tsx)
   8. `Grupos` (GroupsTab.tsx)
   9. `Cobradores` (CollectorsTab.tsx)
   10. `Cargar Ventas` (SalesEntryTab.tsx)
   11. `Pagos Agencias` (PaymentsTab.tsx)
   12. `Gastos por Agencia` (ExpensesTab.tsx)
   13. `Saldo Agencias` (AccountBalancesTab.tsx)
   14. `Venta Real` (RealSalesTab.tsx)
   15. `Pagos a Proveedores` (OperatorsTab.tsx / pagos)
   16. `Reporte Proveedores` (OperatorsTab.tsx / reporte)
   17. `Config. Proveedores` (SystemsTab.tsx)
   18. `Gastos Administrativos` (AdministrativeExpensesTab.tsx)
   19. `Cierre ` (WeeklyClosureTab.tsx y PreClosureAuditTab.tsx)
   20. `Auditoría` (AuditLogTab.tsx)
   21. `Ajustes` (CycleSettingsTab.tsx)
   22. `Usuarios` (UsersTab.tsx)

2. **Paridad Estricta Modo Claro / Modo Oscuro:**
   - Modo Claro: `bg-slate-50`, tarjetas `bg-white border-slate-200/80 text-slate-900 shadow-sm`.
   - Modo Oscuro: `dark:bg-[#0b1120]` / `dark:bg-slate-950`, tarjetas `dark:bg-[#111827]` / `dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100`.
   - Prohibido gradientes oscuros fijos en Modo Claro (ej. banners de semana cerrada en Cargar Ventas y Cierre).
     Usar: Light `bg-amber-50 border border-amber-300 text-amber-900` | Dark `dark:bg-amber-950/30 dark:border-amber-700/60 dark:text-amber-200`.

3. **Monedas 100% Dinámicas:**
   - Prohibido arrays fijos `['BS', 'USD', 'COP']`. Todas las pantallas deben leer de `loadCurrencies(effectiveUserId)` o `getActiveCurrencies()`.
   - Grids de KPIs deben adaptarse dinámicamente a 1, 2, 3 o 4+ columnas.

4. **Botón Primario Esmeralda Único:**
   - Estilo obligatorio: `bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-5 py-2.5 shadow-sm transition-all`.
   - Prohibido inventar colores sin el texto explícito del usuario `"CAMBIO VISUAL AUTORIZADO"`.
