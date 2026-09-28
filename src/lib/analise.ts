// Camada de análise do estoque: todos os cálculos partem apenas de materiais, entradas, saídas e histórico.
export type MatA = { id: string; codigo: string; descricao: string; unidade: string; estoque_minimo: number; created_at: string };
export type EntA = { id: string; material_id: string; quantidade: number; custo_unitario: number; fornecedor: string | null; data: string };
export type SaiA = { id: string; material_id: string; quantidade: number; destino_tipo: string; destino_nome: string; data: string };

export type Filtros = {
  inicio: string; // yyyy-mm-dd
  fim: string;
  materiais: string[]; // vazio = todos
  tipo: "todas" | "entradas" | "saidas";
  destino: "todos" | "unidade" | "pessoa";
};

export type Nivel = "critico" | "atencao" | "normal";

export type LinhaMaterial = {
  id: string; codigo: string; descricao: string; unidade: string; minimo: number;
  saldo: number; saldoInicio: number; custoMedio: number;
  entradasPer: number; saidasPer: number; saidasAnt: number; varPct: number | null;
  tendencia: "alta" | "queda" | "estavel" | "sem_dados";
  consumoMensal: number | null; mesesHist: number; cobertura: number | null;
  ultimaMov: string | null; diasParado: number; frequencia: number;
  nivel: Nivel; motivoNivel: string;
};

export type Sazonal = {
  id: string; codigo: string; descricao: string; mediaMensal: number;
  mesPico: number; mesVale: number; indicePico: number; indiceVale: number; varPct: number;
  anos: number; meses: number; confianca: "baixa" | "média" | "alta";
  indices: (number | null)[]; tendencia: boolean;
  indiceProximo: number | null; coberturaSazonal: number | null;
};

export type Alerta = { nivel: Nivel; titulo: string; texto: string; periodo: string; materiais: string[] };

export type Analise = {
  filtros: Filtros; dias: number; antInicio: string; antFim: string;
  kpis: {
    estoqueTotal: number; valorEstoque: number;
    entradas: number; entradasAnt: number; saidas: number; saidasAnt: number;
    liquida: number; abaixoMinimo: number; semMov: number; materiais: number;
  };
  linhas: LinhaMaterial[];
  evolucao: { data: string; saldo: number }[];
  mensal: { mes: string; entradas: number; saidas: number; liquido: number }[];
  pareto: { top: number; share: number; lista: LinhaMaterial[] } | null;
  parados: { faixa: string; min: number; materiais: LinhaMaterial[]; unidades: number; pct: number }[];
  estoqueAltoBaixoConsumo: LinhaMaterial[];
  sazonal: Sazonal[]; sazonalMsg: string | null;
  mesesPorAno: { ano: number; valores: (number | null)[] }[];
  trimestres: { ano: number; valores: (number | null)[] }[];
  alertas: Alerta[];
  insights: string[];
  resumo: string[];
  entradasFiltradas: EntA[]; saidasFiltradas: SaiA[];
};

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIA = 86400000;
const d = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).getTime();
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const br = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");
const n0 = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
const n1 = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${n0(v)}%`;
const soma = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
const varP = (atual: number, ant: number) => (ant > 0 ? ((atual - ant) / ant) * 100 : null);
const mesKey = (s: string) => s.slice(0, 7);

function correl(ys: number[]) {
  const n = ys.length; if (n < 4) return 0;
  const xm = (n - 1) / 2, ym = soma(ys, (y) => y) / n;
  let a = 0, b = 0, c = 0;
  ys.forEach((y, x) => { a += (x - xm) * (y - ym); b += (x - xm) ** 2; c += (y - ym) ** 2; });
  return b && c ? a / Math.sqrt(b * c) : 0;
}

export function analisar(mats: MatA[], ents: EntA[], sais: SaiA[], f: Filtros): Analise {
  const hoje = iso(Date.now());
  const ini = d(f.inicio), fim = d(f.fim);
  const dias = Math.max(1, Math.round((fim - ini) / DIA) + 1);
  const antFimT = ini - DIA, antIniT = antFimT - (dias - 1) * DIA;
  const antInicio = iso(antIniT), antFim = iso(antFimT);
  const sel = new Set(f.materiais.length ? f.materiais : mats.map((m) => m.id));
  const M = mats.filter((m) => sel.has(m.id));
  const E = ents.filter((e) => sel.has(e.material_id));
  const S = sais.filter((s) => sel.has(s.material_id) && (f.destino === "todos" || s.destino_tipo === f.destino));
  const noPer = (x: { data: string }) => d(x.data) >= ini && d(x.data) <= fim;
  const noAnt = (x: { data: string }) => d(x.data) >= antIniT && d(x.data) <= antFimT;
  const ateFim = (x: { data: string }) => d(x.data) <= fim;
  const antesIni = (x: { data: string }) => d(x.data) < ini;

  const primeiraData = [...E, ...S].reduce<number | null>((m, x) => (m === null || d(x.data) < m ? d(x.data) : m), null);

  const linhas: LinhaMaterial[] = M.map((m) => {
    const e = E.filter((x) => x.material_id === m.id);
    const s = S.filter((x) => x.material_id === m.id);
    const sAll = sais.filter((x) => x.material_id === m.id); // saldo usa todas as saídas
    const qE = soma(e.filter(ateFim), (x) => x.quantidade);
    const qS = soma(sAll.filter(ateFim), (x) => x.quantidade);
    const saldo = qE - qS;
    const saldoInicio = soma(e.filter(antesIni), (x) => x.quantidade) - soma(sAll.filter(antesIni), (x) => x.quantidade);
    const totE = soma(e, (x) => x.quantidade);
    const custoMedio = totE ? soma(e, (x) => x.quantidade * Number(x.custo_unitario)) / totE : 0;
    const saidasPer = soma(s.filter(noPer), (x) => x.quantidade);
    const saidasAnt = soma(s.filter(noAnt), (x) => x.quantidade);
    const vp = varP(saidasPer, saidasAnt);
    const tendencia = saidasPer === 0 && saidasAnt === 0 ? "sem_dados" : vp === null ? "alta" : vp > 10 ? "alta" : vp < -10 ? "queda" : "estavel";
    // consumo médio mensal histórico até o fim do período
    const sHist = s.filter(ateFim);
    const inicioHist = [...e, ...s].reduce<number | null>((mn, x) => (mn === null || d(x.data) < mn ? d(x.data) : mn), null);
    const mesesHist = inicioHist === null ? 0 : Math.max(0, (fim - inicioHist) / (30.44 * DIA));
    const consumoMensal = mesesHist >= 1 && sHist.length ? soma(sHist, (x) => x.quantidade) / mesesHist : null;
    const cobertura = consumoMensal && consumoMensal > 0 ? Math.max(0, saldo) / consumoMensal : null;
    const movs = [...e, ...sAll].filter(ateFim).map((x) => x.data).sort();
    const ultimaMov = movs.length ? movs[movs.length - 1]! : null;
    const diasParado = Math.round((fim - d(ultimaMov ?? m.created_at)) / DIA);
    let nivel: Nivel = "normal", motivoNivel = "Saldo acima do mínimo e cobertura confortável";
    if (saldo <= 0) { nivel = "critico"; motivoNivel = "Sem saldo"; }
    else if (saldo <= m.estoque_minimo) { nivel = "critico"; motivoNivel = `Saldo ${n0(saldo)} ≤ mínimo ${n0(m.estoque_minimo)}`; }
    else if (cobertura !== null && cobertura < 1) { nivel = "atencao"; motivoNivel = `Cobertura estimada de ${n1(cobertura)} mês pelo consumo médio`; }
    else if (saldo <= m.estoque_minimo * 1.5) { nivel = "atencao"; motivoNivel = `Saldo próximo do mínimo (${n0(m.estoque_minimo)})`; }
    return {
      id: m.id, codigo: m.codigo, descricao: m.descricao, unidade: m.unidade, minimo: m.estoque_minimo,
      saldo, saldoInicio, custoMedio, entradasPer: soma(e.filter(noPer), (x) => x.quantidade), saidasPer, saidasAnt, varPct: vp,
      tendencia, consumoMensal, mesesHist, cobertura, ultimaMov, diasParado, frequencia: s.filter(noPer).length, nivel, motivoNivel,
    };
  });

  const entradas = soma(linhas, (l) => l.entradasPer);
  const saidas = soma(linhas, (l) => l.saidasPer);
  const entradasAnt = soma(E.filter(noAnt), (x) => x.quantidade);
  const saidasAnt = soma(linhas, (l) => l.saidasAnt);
  const estoqueTotal = soma(linhas, (l) => Math.max(0, l.saldo));

  // evolução do saldo total
  const passo = dias > 120 ? 7 : 1;
  const evolucao: Analise["evolucao"] = [];
  const Sall = sais.filter((x) => sel.has(x.material_id));
  for (let t = ini; t <= fim; t += passo * DIA) {
    const lim = Math.min(t, fim);
    evolucao.push({ data: br(iso(lim)), saldo: soma(E.filter((x) => d(x.data) <= lim), (x) => x.quantidade) - soma(Sall.filter((x) => d(x.data) <= lim), (x) => x.quantidade) });
  }
  if (evolucao.length && passo > 1) evolucao.push({ data: br(f.fim), saldo: soma(linhas, (l) => l.saldo) });

  // mensal dentro do período
  const mm = new Map<string, { entradas: number; saidas: number }>();
  for (let t = ini; t <= fim; t += DIA) { const k = iso(t).slice(0, 7); if (!mm.has(k)) mm.set(k, { entradas: 0, saidas: 0 }); }
  E.filter(noPer).forEach((x) => { mm.get(mesKey(x.data))!.entradas += x.quantidade; });
  S.filter(noPer).forEach((x) => { mm.get(mesKey(x.data))!.saidas += x.quantidade; });
  const mensal = [...mm.entries()].map(([k, v]) => ({ mes: `${MESES[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`, ...v, liquido: v.entradas - v.saidas }));

  // pareto
  const rank = [...linhas].filter((l) => l.saidasPer > 0).sort((a, b) => b.saidasPer - a.saidasPer);
  const top = Math.min(10, rank.length);
  const pareto = saidas > 0 && rank.length >= 2 ? { top, share: (soma(rank.slice(0, top), (l) => l.saidasPer) / saidas) * 100, lista: rank.slice(0, top) } : null;

  // parados
  const faixas = [{ faixa: "30 a 59 dias", min: 30, max: 59 }, { faixa: "60 a 89 dias", min: 60, max: 89 }, { faixa: "90 a 119 dias", min: 90, max: 119 }, { faixa: "120 dias ou mais", min: 120, max: Infinity }];
  const parados = faixas.map((fx) => {
    const ms = linhas.filter((l) => l.saldo > 0 && l.diasParado >= fx.min && l.diasParado <= fx.max);
    const u = soma(ms, (l) => l.saldo);
    return { faixa: fx.faixa, min: fx.min, materiais: ms, unidades: u, pct: estoqueTotal ? (u / estoqueTotal) * 100 : 0 };
  });
  const semMov = linhas.filter((l) => l.saldo > 0 && l.diasParado >= 30).length;
  const estoqueAltoBaixoConsumo = linhas.filter((l) => l.saldo > l.minimo * 3 && (l.cobertura === null ? l.saidasPer === 0 && l.mesesHist >= 1 : l.cobertura > 12));

  // sazonalidade: série mensal por material em todo o histórico
  const mesesHistorico = primeiraData === null ? [] : (() => {
    const out: string[] = []; const a = new Date(primeiraData); const b = new Date(`${hoje}T12:00:00`);
    const c = new Date(a.getFullYear(), a.getMonth(), 1);
    while (c <= b) { out.push(`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`); c.setMonth(c.getMonth() + 1); }
    // mês corrente incompleto fica de fora
    return out.slice(0, -1);
  })();
  const proxMes = (new Date(`${hoje}T12:00:00`).getMonth() + 1) % 12;
  const sazonal: Sazonal[] = [];
  const serieMes = (ids: Set<string>) => mesesHistorico.map((k) => soma(S.filter((x) => ids.has(x.material_id) && mesKey(x.data) === k), (x) => x.quantidade));
  const calcIndices = (serie: number[]) => {
    const media = serie.length ? soma(serie, (v) => v) / serie.length : 0;
    const porMes: number[][] = Array.from({ length: 12 }, () => []);
    serie.forEach((v, i) => porMes[Number(mesesHistorico[i]!.slice(5)) - 1]!.push(v));
    const indices = porMes.map((vs) => (vs.length >= 2 && media > 0 ? soma(vs, (v) => v) / vs.length / media : null));
    return { media, indices, anos: Math.min(...porMes.filter((v) => v.length).map((v) => v.length)) };
  };
  if (mesesHistorico.length >= 24) {
    linhas.forEach((l) => {
      const serie = serieMes(new Set([l.id]));
      if (soma(serie, (v) => v) === 0) return;
      const { media, indices, anos } = calcIndices(serie);
      const val = indices.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as { v: number; i: number }[];
      if (val.length < 2) return;
      const pico = val.reduce((a, b) => (b.v > a.v ? b : a)); const vale = val.reduce((a, b) => (b.v < a.v ? b : a));
      const tend = Math.abs(correl(serie)) > 0.8;
      if (pico.v < 1.2 && vale.v > 0.8) return; // sem padrão relevante
      const ip = indices[proxMes] ?? null;
      sazonal.push({
        id: l.id, codigo: l.codigo, descricao: l.descricao, mediaMensal: media, mesPico: pico.i, mesVale: vale.i,
        indicePico: pico.v, indiceVale: vale.v, varPct: (pico.v - 1) * 100, anos, meses: serie.length,
        confianca: anos >= 4 ? "alta" : anos >= 3 ? "média" : "baixa", indices, tendencia: tend,
        indiceProximo: ip, coberturaSazonal: ip && media > 0 ? Math.max(0, l.saldo) / (media * ip) : null,
      });
    });
    sazonal.sort((a, b) => Number(a.tendencia) - Number(b.tendencia) || b.indicePico - a.indicePico);
  }
  const sazonalMsg = mesesHistorico.length < 24
    ? `Dados insuficientes para identificar padrões sazonais. São necessários ao menos 2 anos completos de movimentações (há ${mesesHistorico.length} ${mesesHistorico.length === 1 ? "mês" : "meses"} completos de histórico).`
    : sazonal.length ? null : "Não foram encontrados padrões sazonais consistentes no histórico disponível.";
  const tabelaAno = (fn: (k: string) => number, grupos: 12 | 4) => {
    const anos = [...new Set(mesesHistorico.map((k) => Number(k.slice(0, 4))))];
    return anos.map((ano) => ({
      ano,
      valores: Array.from({ length: grupos }, (_, i) => {
        const ks = mesesHistorico.filter((k) => Number(k.slice(0, 4)) === ano && (grupos === 12 ? Number(k.slice(5)) - 1 === i : Math.floor((Number(k.slice(5)) - 1) / 3) === i));
        return ks.length === (grupos === 12 ? 1 : 3) ? soma(ks, fn) : null;
      }),
    }));
  };
  const consumoMes = (k: string) => soma(S.filter((x) => mesKey(x.data) === k), (x) => x.quantidade);
  const mesesPorAno = tabelaAno(consumoMes, 12);
  const trimestres = tabelaAno(consumoMes, 4);

  // anomalias
  const perTxt = `${br(f.inicio)} a ${br(f.fim)}`, antTxt = `${br(antInicio)} a ${br(antFim)}`;
  const alertas: Alerta[] = [];
  linhas.forEach((l) => {
    // média histórica de janelas equivalentes anteriores
    const janelas: number[] = [];
    for (let k = 1; k <= 12; k++) {
      const a = ini - k * dias * DIA, b = ini - (k - 1) * dias * DIA - DIA;
      if (primeiraData === null || b < primeiraData) break;
      janelas.push(soma(S.filter((x) => x.material_id === l.id && d(x.data) >= a && d(x.data) <= b), (x) => x.quantidade));
    }
    if (janelas.length >= 3) {
      const media = soma(janelas, (v) => v) / janelas.length;
      if (media > 0 && l.saidasPer > media * 1.5 && l.saidasPer - media >= 5)
        alertas.push({ nivel: "atencao", titulo: "Consumo muito acima da média histórica", texto: `${l.codigo} teve ${n0(l.saidasPer)} ${l.unidade} de saída, ${pct(((l.saidasPer - media) / media) * 100)} sobre a média de ${n1(media)} das ${janelas.length} janelas anteriores de ${dias} dias.`, periodo: perTxt, materiais: [l.codigo] });
      if (media >= 5 && l.saidasPer < media * 0.5)
        alertas.push({ nivel: "normal", titulo: "Consumo muito abaixo da média histórica", texto: `${l.codigo} teve ${n0(l.saidasPer)} ${l.unidade} de saída, contra média de ${n1(media)} nas ${janelas.length} janelas anteriores de ${dias} dias.`, periodo: perTxt, materiais: [l.codigo] });
    } else if (l.varPct !== null && l.varPct >= 50 && l.saidasPer - l.saidasAnt >= 5) {
      alertas.push({ nivel: "atencao", titulo: "Aumento acelerado do consumo", texto: `As saídas de ${l.codigo} passaram de ${n0(l.saidasAnt)} para ${n0(l.saidasPer)} ${l.unidade} (${pct(l.varPct)}).`, periodo: `${perTxt} vs ${antTxt}`, materiais: [l.codigo] });
    }
    if (l.saldoInicio > 0 && l.saldo < l.saldoInicio * 0.5 && l.saidasPer > 0)
      alertas.push({ nivel: l.nivel === "critico" ? "critico" : "atencao", titulo: "Queda acelerada do estoque", texto: `O saldo de ${l.codigo} caiu de ${n0(l.saldoInicio)} para ${n0(l.saldo)} ${l.unidade} (${pct(((l.saldo - l.saldoInicio) / l.saldoInicio) * 100)}).`, periodo: perTxt, materiais: [l.codigo] });
    if (l.saldo > 0 && l.diasParado >= 90)
      alertas.push({ nivel: "atencao", titulo: "Material sem movimentação por longo período", texto: `${l.codigo} está há ${n0(l.diasParado)} dias sem movimentação, com ${n0(l.saldo)} ${l.unidade} em estoque.`, periodo: `até ${br(f.fim)}`, materiais: [l.codigo] });
    // movimentações excepcionais (z-score sobre o histórico do material)
    const checa = (lista: { quantidade: number; data: string }[], tipo: string) => {
      if (lista.length < 5) return;
      const q = lista.map((x) => x.quantidade); const m = soma(q, (v) => v) / q.length;
      const sd = Math.sqrt(soma(q, (v) => (v - m) ** 2) / q.length);
      if (!sd) return;
      lista.filter(noPer).forEach((x) => {
        if ((x.quantidade - m) / sd >= 2.5)
          alertas.push({ nivel: "atencao", titulo: `${tipo} excepcionalmente grande`, texto: `${tipo} de ${n0(x.quantidade)} ${l.unidade} de ${l.codigo} em ${br(x.data)}, ${n1(x.quantidade / m)}× a média de ${n1(m)} por movimentação (${lista.length} registros).`, periodo: "todo o histórico do material", materiais: [l.codigo] });
      });
    };
    checa(E.filter((x) => x.material_id === l.id), "Entrada");
    checa(S.filter((x) => x.material_id === l.id), "Saída");
  });
  const ordem: Record<Nivel, number> = { critico: 0, atencao: 1, normal: 2 };
  alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);

  // insights
  const insights: string[] = [];
  const liquida = entradas - saidas;
  if (entradas > 0 && saidas > 0) {
    const r = ((saidas - entradas) / entradas) * 100;
    insights.push(r > 0
      ? `As saídas foram ${n0(r)}% superiores às entradas no período, provocando redução líquida de ${n0(-liquida)} unidades no estoque.`
      : `As entradas superaram as saídas em ${n0(((entradas - saidas) / saidas) * 100)}%, com aumento líquido de ${n0(liquida)} unidades.`);
  } else if (saidas > 0) insights.push(`Não houve entradas no período; as ${n0(saidas)} unidades de saída reduziram o estoque na mesma quantidade.`);
  else if (entradas > 0) insights.push(`Houve ${n0(entradas)} unidades de entrada e nenhuma saída no período.`);
  const vs = varP(saidas, saidasAnt);
  if (vs !== null) insights.push(`O total de saídas ${vs >= 0 ? "aumentou" : "diminuiu"} ${n0(Math.abs(vs))}% em relação ao período anterior (${n0(saidasAnt)} → ${n0(saidas)}).`);
  if (pareto) insights.push(`Os ${pareto.top} materiais mais consumidos representam ${n0(pareto.share)}% das saídas do período.`);
  const subiu = linhas.filter((l) => l.varPct !== null && l.varPct >= 20 && l.saidasPer >= 5).sort((a, b) => b.varPct! - a.varPct!)[0];
  if (subiu) insights.push(`O consumo de ${subiu.codigo} — ${subiu.descricao} aumentou ${n0(subiu.varPct!)}% em relação ao período anterior.`);
  const caiu = linhas.filter((l) => l.varPct !== null && l.varPct <= -20 && l.saidasAnt >= 5).sort((a, b) => a.varPct! - b.varPct!)[0];
  if (caiu) insights.push(`O consumo de ${caiu.codigo} — ${caiu.descricao} caiu ${n0(Math.abs(caiu.varPct!))}% em relação ao período anterior.`);
  const p90 = linhas.filter((l) => l.saldo > 0 && l.diasParado >= 90);
  if (p90.length) insights.push(`${p90.length} ${p90.length === 1 ? "material está" : "materiais estão"} sem movimentação há mais de 90 dias, somando ${n0(soma(p90, (l) => l.saldo))} unidades.`);
  const menorCob = linhas.filter((l) => l.cobertura !== null && l.saldo > 0).sort((a, b) => a.cobertura! - b.cobertura!)[0];
  if (menorCob) insights.push(`${menorCob.codigo} tem a menor cobertura estimada: ${n1(menorCob.cobertura!)} ${menorCob.cobertura! < 2 ? "mês" : "meses"} pelo consumo médio histórico.`);
  sazonal.filter((s) => !s.tendencia && s.indiceProximo && s.indiceProximo > 1.2).forEach((s) =>
    insights.push(`Historicamente, o consumo de ${s.codigo} em ${MESES[proxMes]} fica ${n0((s.indiceProximo! - 1) * 100)}% acima da média mensal (${s.anos} anos observados).`));

  const criticos = linhas.filter((l) => l.nivel === "critico");
  const atencao = linhas.filter((l) => l.nivel === "atencao");
  const resumo: string[] = [];
  resumo.push(`Situação geral: ${n0(estoqueTotal)} unidades em ${linhas.filter((l) => l.saldo > 0).length} de ${linhas.length} materiais; ${criticos.length} em nível crítico e ${atencao.length} em atenção.`);
  resumo.push(`Movimentação: ${n0(entradas)} entradas e ${n0(saidas)} saídas, variação líquida de ${liquida >= 0 ? "+" : ""}${n0(liquida)} unidades${vs !== null ? `; saídas ${pct(vs)} vs período anterior` : ""}.`);
  if (rank.length) resumo.push(`Mais consumidos: ${rank.slice(0, 3).map((l) => `${l.codigo} (${n0(l.saidasPer)})`).join(", ")}.`);
  if (criticos.length) resumo.push(`Críticos: ${criticos.slice(0, 5).map((l) => l.codigo).join(", ")}${criticos.length > 5 ? ` e mais ${criticos.length - 5}` : ""}.`);
  if (semMov) resumo.push(`Parados: ${semMov} ${semMov === 1 ? "material" : "materiais"} com saldo e sem movimentação há 30 dias ou mais.`);
  resumo.push(sazonalMsg ? `Sazonalidade: ${sazonalMsg.split(".")[0]}.` : `Sazonalidade: ${sazonal.filter((s) => !s.tendencia).length} materiais com padrão recorrente identificado.`);
  if (alertas.length) resumo.push(`Pontos de atenção: ${alertas.length} comportamentos fora do padrão identificados.`);

  return {
    filtros: f, dias, antInicio, antFim,
    kpis: { estoqueTotal, valorEstoque: soma(linhas, (l) => Math.max(0, l.saldo) * l.custoMedio), entradas, entradasAnt, saidas, saidasAnt, liquida, abaixoMinimo: linhas.filter((l) => l.saldo <= l.minimo).length, semMov, materiais: linhas.length },
    linhas, evolucao, mensal, pareto, parados, estoqueAltoBaixoConsumo, sazonal, sazonalMsg, mesesPorAno, trimestres, alertas, insights, resumo,
    entradasFiltradas: f.tipo === "saidas" ? [] : E.filter(noPer), saidasFiltradas: f.tipo === "entradas" ? [] : S.filter(noPer),
  };
}
