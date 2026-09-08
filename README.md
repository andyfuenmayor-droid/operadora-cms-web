# Operadora CMS Web 🚀

Panel de Control Maestro y CRM para Operadoras y Bancas de Apuestas de **Multibanca Express**.
Versión moderna desarrollada en **React 19 + TypeScript + Vite + TailwindCSS v4**.

---

## 🌐 Dominio y Producción
- **URL**: `https://crm.multibancaexpress.com`
- **Infraestructura**: Contenedor Docker en Droplet DigitalOcean con Nginx reverse proxy y SSL automático (Certbot).
- **Puerto Interno**: `8530`

---

## 🛠️ Stack Tecnológico
- **Frontend**: React 19 + TypeScript
- **Bundler**: Vite 8 (con cache-busting automático por hash y timestamp)
- **Estilos**: TailwindCSS v4 + Dark Glassmorphism UI
- **Iconografía**: Lucide React
- **Base de Datos & Auth**: Supabase (@supabase/supabase-js)
- **CI/CD**: GitHub Actions (`.github/workflows/deploy.yml`)

---

## 💻 Desarrollo Local
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build
```

---

## 🚀 Despliegue Automatizado
Cualquier `push` a la rama `main` ejecuta el workflow de GitHub Actions que compila la imagen de Docker y actualiza el servicio en DigitalOcean:
```bash
git push origin main
```
