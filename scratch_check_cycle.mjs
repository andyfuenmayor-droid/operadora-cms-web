import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://envojryuxdmcamlolkgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVudm9qcnl1eGRtY2FtbG9sa2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzY1NzMsImV4cCI6MjA4NzY1MjU3M30.0zGpypHi09GInBksu-zNAKi1k-cTHIBM39YrsEaamRc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function normalizarMoneda(mon) {
  const m = String(mon || '').toUpperCase().trim();
  if (m.includes('BS') || m.includes('BOL') || m.includes('VES')) return 'BS';
  if (m.includes('USD') || m.includes('DOL') || m === '$') return 'USD';
  if (m.includes('COP') || m.includes('PES')) return 'COP';
  return 'COP';
}

async function run() {
  const userId = '66110483-c4da-42ab-82bf-7d2f3e1a6b1b';
  const fechaDesde = '2026-08-31';
  const fechaHasta = '2026-09-06';

  const [agRes, cargaRes, pDiariosRes, pBancosRes, pSemanaRes, gDiariosRes, gastosRes] = await Promise.all([
    supabase.from('agencias').select('*').eq('user_id', userId).order('id', { ascending: true }),
    supabase.from('carga_actual').select('*').eq('user_id', userId),
    supabase.from('cda_pagos_diarios').select('*').eq('user_id', userId),
    supabase.from('cda_pagos_bancarios').select('*').eq('user_id', userId).eq('confirmado', true),
    supabase.from('pagos_semana').select('*').eq('user_id', userId),
    supabase.from('cda_gastos_diarios').select('*').eq('user_id', userId),
    supabase.from('gastos').select('*').eq('user_id', userId),
  ]);

  const agencias = agRes.data || [];
  const carga = cargaRes.data || [];
  const pDiarios = pDiariosRes.data || [];
  const pBancos = pBancosRes.data || [];
  const pSemana = pSemanaRes.data || [];
  const gDiarios = gDiariosRes.data || [];
  const gastos = gastosRes.data || [];

  console.log('=== VERIFICACION CON FILTRO DE CICLO ACTIVO (2026-08-31 al 2026-09-06) ===');

  const rows = [];

  for (const ag of agencias) {
    const nom = ag.nombre_agencia.toUpperCase().trim();
    const currencies = ['BS', 'USD', 'COP'];

    for (const mon of currencies) {
      const colIni = mon === 'BS' ? 'saldo_inicial_bs' : mon === 'USD' ? 'saldo_inicial_usd' : 'saldo_inicial_cop';
      const sAnt = Number(ag[colIni] || 0);

      const agSales = carga.filter((s) => s.agencia === nom && normalizarMoneda(s.moneda) === mon);
      const vtaNeta = agSales.reduce((sum, curr) => sum + Number(curr.neto || curr.util_op || 0), 0);

      // Gastos (solo ciclo)
      const agExp = [
        ...gastos.filter(g => g.agencia === nom && normalizarMoneda(g.moneda) === mon && Boolean(g.confirmado) && (!g.fecha || (g.fecha.slice(0,10) >= fechaDesde && g.fecha.slice(0,10) <= fechaHasta))),
        ...gDiarios.filter(g => (g.agencia || g.nombre_agency) === nom && normalizarMoneda(g.moneda) === mon && (g.confirmado || g.confirmado_supervisor) && (!g.fecha || (g.fecha.slice(0,10) >= fechaDesde && g.fecha.slice(0,10) <= fechaHasta)))
      ];
      const gTot = agExp.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Cobradores de Ruta (solo pagos con fecha en el ciclo)
      const agCobradorList = pDiarios.filter((p) => {
        const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === nom;
        const matchMon = normalizarMoneda(p.moneda) === mon;
        const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
        const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor) || Boolean(p.fecha_escaneo_cobrador);
        const fStr = (p.fecha || p.created_at || '').slice(0, 10);
        const inCycle = !fStr || (fStr >= fechaDesde && fStr <= fechaHasta);
        return matchAg && matchMon && isCob && isConf && !p.rechazado && inCycle;
      });
      const cobradorRutaTot = agCobradorList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Efectivo Taquilla (solo pagos diarios NO cobrador con fecha en el ciclo)
      const agEfectivoList = pDiarios.filter((p) => {
        const matchAg = (p.agencia || p.nombre_agency || '').trim().toUpperCase() === nom;
        const matchMon = normalizarMoneda(p.moneda) === mon;
        const isCob = Boolean(p.qr_token) || String(p.tipo_pago || '').toUpperCase().includes('COBRADOR');
        const isConf = Boolean(p.confirmado) || Boolean(p.confirmado_supervisor);
        const fStr = (p.fecha || p.created_at || '').slice(0, 10);
        const inCycle = !fStr || (fStr >= fechaDesde && fStr <= fechaHasta);
        return matchAg && matchMon && !isCob && isConf && !p.rechazado && inCycle;
      });
      const efectivoTaquillaTot = agEfectivoList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Bancos ordinarios (solo ciclo)
      const agBancosList = [
        ...pBancos.filter(p => p.agencia === nom && normalizarMoneda(p.moneda) === mon && p.confirmado && !p.rechazado && (!p.fecha || (p.fecha.slice(0,10) >= fechaDesde && p.fecha.slice(0,10) <= fechaHasta))),
        ...pSemana.filter(p => p.agencia === nom && normalizarMoneda(p.moneda) === mon && !p.rechazado && !String(p.tipo_pago || '').toUpperCase().includes('PREMIO'))
      ];
      const bancosTot = agBancosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      // Reposicion de Premios (pagos_semana de tipo premio)
      const agPremiosList = pSemana.filter(p => p.agencia === nom && normalizarMoneda(p.moneda) === mon && !p.rechazado && String(p.tipo_pago || '').toUpperCase().includes('PREMIO'));
      const reposicionPremiosTot = agPremiosList.reduce((sum, curr) => sum + Number(curr.monto || 0), 0);

      const totalCobros = cobradorRutaTot + efectivoTaquillaTot + bancosTot;
      const saldoFinal = Math.round((sAnt + vtaNeta - gTot - totalCobros + reposicionPremiosTot) * 100) / 100;

      if (Math.abs(sAnt) > 0.01 || Math.abs(vtaNeta) > 0.01 || gTot > 0 || totalCobros > 0 || reposicionPremiosTot > 0) {
        rows.push({
          agencia: nom,
          moneda: mon,
          arrastre: sAnt,
          vtaNeta,
          gastos: gTot,
          cobradorRuta: cobradorRutaTot,
          cobradorDetalle: agCobradorList.map(c => ({ id: c.id, monto: c.monto, pin: c.qr_token, fecha: c.fecha })),
          efectivoTaquilla: efectivoTaquillaTot,
          efectivoDetalle: agEfectivoList.map(e => ({ id: e.id, monto: e.monto, fecha: e.fecha })),
          bancos: bancosTot,
          reposicionPremios: reposicionPremiosTot,
          saldoFinal
        });
      }
    }
  }

  console.log(JSON.stringify(rows, null, 2));
}

run();
