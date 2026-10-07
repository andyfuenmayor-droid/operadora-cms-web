# 📘 Documentación Oficial: API Pública de Pagos
### Operadora CMS • Multibanca Express

La **API Pública de Pagos** permite a aplicaciones móviles, taquillas web, bots de mensajería (Telegram / WhatsApp), pasarelas externas y sistemas contables registrar pagos entrantes de forma automatizada y en tiempo real dentro de la plataforma **Operadora CMS**.

Todos los pagos registrados a través de esta API ingresan inmediatamente al flujo de **Confirmaciones** del sistema, emitiendo alertas sonoras y visuales para los operadores y cajeros.

---

## 🌐 1. URLs Base del Servicio

| Entorno | URL Base | Protocolo |
| :--- | :--- | :--- |
| **Producción Oficial** | `https://crm.multibancaexpress.com/api/v1` | HTTPS (Puerto 443) |
| **Servidor Local / Pruebas** | `http://localhost:3001/api/v1` | HTTP (Puerto 3001) |
| **Supabase Edge Function** | `https://envojryuxdmcamlolkgp.supabase.co/functions/v1/receive-payment` | HTTPS Serverless |

---

## 🔐 2. Autenticación y Seguridad

Todas las peticiones a los endpoints de la API (excepto `/health`) requieren una clave de acceso válida (**API Key**).

### Formato de Encabezado HTTP:
Debes incluir tu clave en el encabezado `X-API-Key` o `Authorization`:

```http
X-API-Key: mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c
```
*O alternativamente:*
```http
Authorization: Bearer mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c
```

> 💡 **Gestión de Claves:** Puedes ver, copiar o regenerar tu API Key en cualquier momento desde los módulos **"Confirmaciones"** o **"Pagos Agencias"** haciendo clic en el botón superior **"🔌 Conectar Apps / API"**.

### Características de Seguridad y Flujo Operativo:
- **Flujo Obligatorio por Confirmaciones:** Todo pago recibido desde una app externa ingresa estrictamente en estado `PENDIENTE` a la **Pizarra de Confirmaciones** (`cda_pagos_bancarios`). El operador o cajero recibe una alerta instantánea, verifica los fondos en el banco y hace clic en **"Confirmar"** o **"Rechazar"**. Ninguna aplicación externa puede puentear o saltarse la verificación humana del cajero.
- **Deduplicación Antifraude:** La API valida automáticamente que no se intente registrar un pago con la misma referencia bancaria, monto, moneda y agencia en los últimos 7 días. Si se detecta un duplicado, responde con código `409 Conflict`.
- **Límite de Tasa (Rate Limiting):** Hasta 100 peticiones por minuto por dirección IP.
- **CORS Habilitado:** Permite llamadas directas desde navegadores web, apps híbridas y servidores backend.

---

## 📡 3. Especificación de Endpoints

### 1. Registrar Nuevo Pago Entrante
`POST /api/v1/payments`

Registra una transacción entrante individual. El pago entra automáticamente a la **Pizarra de Confirmaciones** en estado `PENDIENTE` identificado con la etiqueta `⚡ API Externa (App / Web)`. Al ser aprobado por el cajero, se sincroniza a `pagos_semana` impactando el saldo de la agencia.

#### Parámetros del Cuerpo (JSON):

| Campo | Tipo | Requerido | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- | :--- |
| `agencia` | `string` | **Sí** | Nombre exacto o ID de la agencia asignada. | `"AGENCIA CENTRAL 01"` |
| `monto` | `number` | **Sí** | Monto numérico mayor a cero. | `150000.00` |
| `moneda` | `string` | **Sí** | Código de moneda (`COP`, `USD`, `BS`, `EUR`, `USDT`). | `"COP"` |
| `referencia` | `string` | **Sí** | Código o número de comprobante bancario. | `"REF-482910"` |
| `metodo` | `string` | No | Método de pago (`TRANSFERENCIA`, `PAGO MOVIL`, `ZELLE`, `BINANCE`, `PUNTO DE VENTA`, `EFECTIVO`). | `"TRANSFERENCIA"` |
| `pagador` | `string` | No | Nombre, cédula o teléfono del cliente que transfirió. | `"CARLOS MENDEZ - CI 18.450.210"` |
| `concepto` | `string` | No | Motivo del pago o recarga. | `"Recarga de saldo App Móvil"` |
| `telefono` | `string` | No | Número telefónico de contacto del pagador. | `"+584141234567"` |
| `cuenta_destino` | `string` | No | Cuenta bancaria receptora o serial de terminal POS. | `"Banesco 0134-..."` |
| `comprobante_url`| `string` | No | URL pública o imagen del comprobante/recibo. | `"https://cdn.tuservidor.com/img.jpg"` |
| `confirmado` | `boolean`| No | **Regla Estricta:** Todo pago entra siempre en `false` (`PENDIENTE`). Pasa obligatoriamente a la Pizarra de Confirmaciones para validación humana por un cajero. | `false` |
| `fecha` | `string` | No | Fecha ISO de la transacción. (Por defecto: fecha/hora actual). | `"2026-10-06T20:30:00Z"` |
| `metadata` | `object` | No | Objeto JSON libre con datos internos de tu aplicación (ID de orden, usuario, etc.). | `{"order_id": 9921, "cajero": "caja_2"}` |

#### Ejemplo de Solicitud (cURL):
```bash
curl -X POST "https://crm.multibancaexpress.com/api/v1/payments" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c" \
  -d '{
    "agencia": "AGENCIA CENTRAL 01",
    "monto": 250000.00,
    "moneda": "COP",
    "referencia": "REF-998822",
    "metodo": "TRANSFERENCIA",
    "pagador": "JUAN PEREZ",
    "concepto": "Recarga de saldo usuario #5044",
    "confirmado": false
  }'
```

#### Respuesta Exitosa (`201 Created`):
```json
{
  "success": true,
  "mensaje": "Pago recibido exitosamente. En cola para confirmación por el operador en Pizarra.",
  "transaccion": {
    "id": 1402,
    "tracking_id": "TX-A1B2C3D4-9921",
    "agencia": "AGENCIA CENTRAL 01",
    "monto": 250000,
    "moneda": "COP",
    "referencia": "REF-998822",
    "metodo": "TRANSFERENCIA",
    "concepto": "Recarga de saldo usuario #5044",
    "pagador": "JUAN PEREZ",
    "estado": "PENDIENTE",
    "fecha_recepcion": "2026-10-06T21:20:00.000Z",
    "metadata": null
  }
}
```

#### Respuesta de Pago Duplicado (`409 Conflict`):
```json
{
  "success": false,
  "error": "PAGO_DUPLICADO",
  "message": "El pago con referencia 'REF-998822' (COP 250000) ya fue recibido previamente.",
  "transaccion_existente": {
    "id": 1402,
    "referencia": "REF-998822",
    "monto": 250000,
    "moneda": "COP",
    "agencia": "AGENCIA CENTRAL 01",
    "estado": "PENDIENTE",
    "fecha_registro": "2026-10-06T21:20:00.000Z"
  }
}
```

---

### 2. Carga Masiva de Pagos (Batch)
`POST /api/v1/payments/batch`

Permite procesar hasta 50 pagos en un solo llamado HTTP, ideal para sincronizaciones al cierre del día o procesos batch.

#### Ejemplo de Solicitud:
```json
{
  "pagos": [
    {
      "agencia": "AGENCIA 01",
      "monto": 100000,
      "moneda": "COP",
      "referencia": "BATCH-01",
      "metodo": "PAGO MOVIL"
    },
    {
      "agencia": "AGENCIA 02",
      "monto": 50.00,
      "moneda": "USD",
      "referencia": "BATCH-02",
      "metodo": "ZELLE"
    }
  ]
}
```

#### Respuesta (`207 Multi-Status`):
```json
{
  "success": true,
  "resumen": {
    "total": 2,
    "procesados_exitosos": 2,
    "fallidos": 0
  },
  "resultados": [
    {
      "referencia": "BATCH-01",
      "estado": "PROCESADO",
      "transaccion": { "id": 1403, "monto": 100000, "estado": "PENDIENTE" }
    },
    {
      "referencia": "BATCH-02",
      "estado": "PROCESADO",
      "transaccion": { "id": 1404, "monto": 50, "estado": "PENDIENTE" }
    }
  ]
}
```

---

### 3. Consultar / Verificar Estado de un Pago
`GET /api/v1/payments/verify?referencia={REF}` o `GET /api/v1/payments/verify?id={ID}`

Permite a tu aplicación externa consultar si un pago previamente reportado ya fue **CONFIRMADO** o **RECHAZADO** por el operador del CMS.

#### Ejemplo de Consulta:
```bash
curl -X GET "https://crm.multibancaexpress.com/api/v1/payments/verify?referencia=REF-998822" \
  -H "X-API-Key: mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c"
```

#### Respuesta (`200 OK`):
```json
{
  "success": true,
  "pago": {
    "id": 1402,
    "referencia": "REF-998822",
    "agencia": "AGENCIA CENTRAL 01",
    "monto": 250000,
    "moneda": "COP",
    "metodo": "TRANSFERENCIA",
    "concepto": "Recarga de saldo usuario #5044",
    "pagador": "JUAN PEREZ",
    "estado": "CONFIRMADO",
    "confirmado": true,
    "rechazado": false,
    "motivo_rechazo": null,
    "fecha": "2026-10-06T21:20:00.000Z"
  }
}
```

---

### 4. Modo Simulador / Sandbox
`POST /api/v1/payments/simulate`

Valida que la estructura del JSON y los campos sean correctos sin guardar nada en la base de datos real.

#### Respuesta (`200 OK`):
```json
{
  "success": true,
  "modo": "SANDBOX / SIMULACION (No se guardó en BD)",
  "mensaje": "Validación de estructura de pago exitosa. Los datos cumplen con todas las reglas de negocio.",
  "datos_validados": {
    "agencia": "AGENCIA 01",
    "monto": 50000,
    "moneda": "COP",
    "referencia": "TEST-123",
    "metodo": "PAGO MOVIL",
    "estado_simulado": "PENDIENTE",
    "fecha_prueba": "2026-10-06T21:25:00.000Z"
  }
}
```

---

### 5. Health Check
`GET /api/v1/health`

No requiere autenticación. Permite a balanceadores de carga y herramientas de monitoreo verificar el estado del servicio.

```json
{
  "status": "UP",
  "servicio": "Multibanca Express Payments API",
  "timestamp": "2026-10-06T21:25:00.000Z",
  "uptime_seconds": 3600,
  "version": "1.0.0"
}
```

---

## 💻 4. Ejemplos de Implementación en Código

### JavaScript / Node.js
```javascript
import fetch from 'node-fetch';

async function reportarPago() {
  const url = 'https://crm.multibancaexpress.com/api/v1/payments';
  const apiKey = 'mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c';

  const payload = {
    agencia: 'AGENCIA CENTRAL 01',
    monto: 150000.00,
    moneda: 'COP',
    referencia: 'REF-789012',
    metodo: 'TRANSFERENCIA',
    pagador: 'MARIA RODRIGUEZ',
    concepto: 'Pago de Apuesta Externa #1024'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Resultado:', data);
  } catch (error) {
    console.error('Error al enviar pago:', error);
  }
}

reportarPago();
```

---

### Python 3
```python
import requests

url = "https://crm.multibancaexpress.com/api/v1/payments"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c"
}

payload = {
    "agencia": "AGENCIA CENTRAL 01",
    "monto": 150000.00,
    "moneda": "COP",
    "referencia": "REF-789012",
    "metodo": "TRANSFERENCIA",
    "pagador": "MARIA RODRIGUEZ",
    "concepto": "Pago de Apuesta Externa #1024"
}

response = requests.post(url, json=payload, headers=headers)
print("Código HTTP:", response.status_code)
print("Respuesta:", response.json())
```

---

### PHP (cURL)
```php
<?php
$url = "https://crm.multibancaexpress.com/api/v1/payments";
$apiKey = "mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c";

$payload = json_encode([
    "agencia" => "AGENCIA CENTRAL 01",
    "monto" => 150000.00,
    "moneda" => "COP",
    "referencia" => "REF-789012",
    "metodo" => "TRANSFERENCIA",
    "pagador" => "MARIA RODRIGUEZ",
    "concepto" => "Pago de Apuesta Externa #1024"
]);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "X-API-Key: " . $apiKey
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "Status: " . $httpCode . "\n";
echo "Respuesta: " . $response . "\n";
?>
```

---

### Dart / Flutter
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<void> registrarPagoEnCms() async {
  final url = Uri.parse('https://crm.multibancaexpress.com/api/v1/payments');
  const apiKey = 'mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c';

  final body = jsonEncode({
    'agencia': 'AGENCIA CENTRAL 01',
    'monto': 150000.00,
    'moneda': 'COP',
    'referencia': 'REF-789012',
    'metodo': 'TRANSFERENCIA',
    'pagador': 'MARIA RODRIGUEZ',
    'concepto': 'Pago de Apuesta Externa #1024'
  });

  final response = await http.post(
    url,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: body,
  );

  if (response.statusCode == 201) {
    print('Pago registrado con éxito: ${response.body}');
  } else {
    print('Error (${response.statusCode}): ${response.body}');
  }
}
```

---

### C# (.NET Core / Framework)
```csharp
using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

class Program
{
    static async Task Main()
    {
        using var client = new HttpClient();
        client.DefaultRequestHeaders.Add("X-API-Key", "mbe_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c");

        var payload = new
        {
            agencia = "AGENCIA CENTRAL 01",
            monto = 150000.00,
            moneda = "COP",
            referencia = "REF-789012",
            metodo = "TRANSFERENCIA",
            pagador = "MARIA RODRIGUEZ",
            concepto = "Pago de Apuesta Externa #1024"
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await client.PostAsync("https://crm.multibancaexpress.com/api/v1/payments", content);
        var result = await response.Content.ReadAsStringAsync();

        Console.WriteLine($"Status: {response.StatusCode}");
        Console.WriteLine($"Respuesta: {result}");
    }
}
```

---

## 🛠️ 5. Ejecución del Servidor de API

Para iniciar el servidor de API en tu entorno:

```bash
# Iniciar servidor Node.js en puerto 3001
npm run server:api
```

O para mantenerlo en ejecución en segundo plano en producción (DigitalOcean Droplet):
```bash
pm2 start server/index.mjs --name operadora-payments-api
pm2 save
```
