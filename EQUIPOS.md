# 🖥️ Control y Sincronización de Equipos: Casa ↔ Oficina

Este documento registra los equipos de trabajo utilizados para el desarrollo de **operadora-cms-web** y define el protocolo de sincronización continua entre el equipo de **Casa** y el de la **Oficina**.

---

## 📌 1. Registro de Equipos

| Propiedad | 🏠 Equipo Casa | 🏢 Equipo Oficina (Este Equipo) |
| :--- | :--- | :--- |
| **Identificador** | `PC-CASA` | `PC-OFICINA` |
| **Hostname Windows actual** | `EdgarOffice` | `ANDYS-PC` |
| **Usuario Windows** | `Edgar Office` | `andyf` |
| **Ruta del Proyecto** | `C:\Users\Edgar Office\Downloads\operadora-cms-web-main` | `c:\Users\andyf\Downloads\operadora-cms-web-main` |
| **Rol habitual** | Desarrollo nocturno, pruebas y ajustes remotos | Desarrollo principal en jornada laboral |
| **Rama Git principal** | `main` | `main` |
| **Repositorio Remoto** | `https://github.com/andyfuenmayor-droid/operadora-cms-web.git` | `https://github.com/andyfuenmayor-droid/operadora-cms-web.git` |

---

## 🏷️ 2. Cómo Renombrar Cada Equipo

### A. Renombrar en Windows (Nombre de Red / Sistema)
> ⚠️ **Nota:** Cambiar el nombre en Windows requiere permisos de **Administrador**.

#### En Casa (`PC-CASA`):
1. Abre **PowerShell como Administrador**.
2. Ejecuta:
   ```powershell
   Rename-Computer -NewName "PC-CASA"
   ```
3. Reinicia la computadora cuando sea conveniente para que tome el nuevo nombre.

#### En la Oficina (`PC-OFICINA`):
1. Abre **PowerShell como Administrador** en el equipo de la oficina.
2. Ejecuta:
   ```powershell
   Rename-Computer -NewName "PC-OFICINA"
   ```
3. Reinicia el equipo al terminar la jornada.

---

### B. Identificación Local del Proyecto (Sin reiniciar)
Para que el entorno identifique inmediatamente dónde estás parado, usamos el archivo local `.workstation` (ignorado en `.gitignore`):
- En la Oficina:
  ```text
  MI-OFICINA
  ```
- En Casa:
  ```text
  MI-CASA
  ```

---

## 🔄 3. Regla de Oro para Trabajar entre Casa y Oficina (Cero Conflictos)

Para evitar desincronizaciones o conflictos de código al moverte de un lugar a otro, sigue religiosamente estos 2 pasos:

```mermaid
graph LR
    subgraph OFICINA ["🏢 En la Oficina"]
        O1["Al llegar: git pull"] --> O2["Desarrollar"]
        O2 --> O3["Al salir: git commit + git push"]
    end

    subgraph CASA ["🏠 En Casa"]
        C1["Al llegar: git pull"] --> C2["Desarrollar"]
        C2 --> C3["Al terminar: git commit + git push"]
    end

    O3 ==>|GitHub| C1
    C3 ==>|GitHub| O1
```

### ☀️ Paso 1: Al Empezar tu Jornada (En Casa o en Oficina)
Siempre antes de escribir una sola línea de código:
```bash
# 1. Asegúrate de estar en main y sin cambios sueltos
git status

# 2. Descarga lo último que subiste desde el otro equipo
git pull origin main
```

### 🌙 Paso 2: Al Terminar tu Jornada (Antes de Salir de la Oficina o Ir a Dormir)
Siempre antes de cambiar de equipo:
```bash
# 1. Revisa los archivos modificados
git status

# 2. Agrega y sube los cambios
git add .
git commit -m "feat/fix: [descripción de lo que avanzaste]"
git push origin main
```

---

## 🔐 4. Variables de Entorno (`.env`)
- El archivo `.env` está en `.gitignore` por seguridad para no exponer credenciales en GitHub.
- **Importante:** Si agregas una variable nueva a `.env` en la oficina, asegúrate de replicarla en el `.env` de casa (y viceversa).

---

## 📋 5. Historial de Sincronizaciones

| Fecha | Equipo | Acción Realizada | Commit / Estado |
| :--- | :--- | :--- | :--- |
| **18/10/2026** | 🏢 Oficina | Módulos de administración, confirmaciones con banco/cajero, conciliación y fixes de tema/contraste en tablas y badges | Commits `2647f14`, `e38ba28`, `bbe6f86`, `f8feb76`, `8d968f7` |
| **19/10/2026** | 🏠 Casa | Fix consolidación de finanzas, exclusión de pagos operadora, fix supervisor `concRaw` y auto-sync de sistemas en catálogo | Commits `caf2c33`, `43556c2`, `afbb47d` |
| **20/10/2026** | 🏠 Casa | Módulos financieros (`ConfirmationsQuick`, `ConfirmationsReport`, `PaymentsTab`, `ConfirmationsBoard`), gastos administrativos y sincronización de auditoría real móvil/desktop | Commits `0072dd3`, `f95feea`, `6b887d8` |
| **21/10/2026** | 🏠 Casa | Componente `SalesEntryTab` para gestión e importación masiva de ventas diarias (17:46) | Commits `4f24906`, `1eda444` |
| **21/10/2026** | 🏢 Oficina | `git pull origin main` + `npm run build` exitoso. Sincronización de 8 commits desde Casa, asignación de `.workstation` (`MI-OFICINA`) y registro de control. | Sincronizado a `1eda444` (`MI-OFICINA`) |
| **21/10/2026** | 🏢 Oficina | Fix(cierre): anular auto-rollback forzado a Semana 41 en `WeeklyClosureTab`, `PreClosureAuditTab` y `AccountBalancesTab`, incorporar botón 'Vaciar Carga' en `SalesEntryTab` y respaldar venta S42 | Pendiente Cierre S41 (`MI-OFICINA`) |
