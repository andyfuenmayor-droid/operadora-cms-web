// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code is designed for Supabase Edge Functions (Deno runtime).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "NO_AUTORIZADO", message: "Falta encabezado X-API-Key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { agencia, monto, moneda, referencia, metodo, concepto, pagador, telefono, cedula, comprobante_url, confirmado, metadata } = body;

    if (!agencia || !monto || !referencia) {
      return new Response(
        JSON.stringify({ success: false, error: "DATOS_INCOMPLETOS", message: "Se requieren 'agencia', 'monto' y 'referencia'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanRef = String(referencia).toUpperCase().trim();
    const cleanAgencia = String(agencia).toUpperCase().trim();
    const numMonto = parseFloat(monto);
    const cleanMoneda = String(moneda || "BS").toUpperCase().trim();
    const cleanMetodo = String(metodo || "TRANSFERENCIA").toUpperCase().trim();
    const nowIso = new Date().toISOString();

    // Deduplication check
    const { data: existing } = await supabase
      .from("cda_pagos_bancarios")
      .select("id, referencia, monto, moneda, creado_el")
      .eq("referencia", cleanRef)
      .eq("moneda", cleanMoneda)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "PAGO_DUPLICADO",
          message: `El pago con referencia '${cleanRef}' ya fue recibido previamente.`,
          transaccion_existente: existing[0],
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert payment (Regla de Negocio: Todo pago recibido de apps externas DEBE pasar por Confirmaciones)
    const payload = {
      agencia: cleanAgencia,
      monto: numMonto,
      moneda: cleanMoneda,
      referencia: cleanRef,
      metodo_pago: cleanMetodo,
      concepto: concepto || `Pago API (${cleanRef})`,
      datos_pagador: pagador || (cedula ? `C.I. ${cedula}` : "CLIENTE EXTERNO") + (telefono ? ` | Tel: ${telefono}` : ""),
      cajero_id: "API",
      comprobante_url: comprobante_url || null,
      confirmado: false,
      confirmado_supervisor: false,
      estado: "PENDIENTE",
      fecha: nowIso,
      created_at: nowIso,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("cda_pagos_bancarios")
      .insert([payload])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        mensaje: "Pago recibido exitosamente en cola de Confirmaciones. Un operador lo verificará en Pizarra.",
        transaccion: {
          id: inserted?.id,
          agencia: cleanAgencia,
          monto: numMonto,
          moneda: cleanMoneda,
          referencia: cleanRef,
          estado: "PENDIENTE",
          requiere_confirmacion: true,
          metadata: metadata || null,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: "ERROR_SERVIDOR", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
