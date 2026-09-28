import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { analisar, iso, MESES, type Analise, type EntA, type Filtros, type MatA, type SaiA, type Nivel, type LinhaMaterial } from "@/lib/analise";
import { dataBR, moeda } from "@/lib/estoque";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Análise e relatórios — Estoque de Marketing Modular" },
      { name: "description", content: "Análise gerencial do estoque: consumo, sazonalidade, cobertura, alertas e relatórios." },
      { property: "og:title", content: "Análise e relatórios — Estoque de Marketing Modular" },
      { property: "og:description", content: "Inteligência do estoque com tendências, alertas e exportação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Relatorios,
});

const n0 = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
const n1 = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);
const n2 = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const pctTxt = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${n0(v)}%`);

const MODULOS = [
  ["resumo", "Resumo executivo"], ["kpis", "Indicadores gerais"], ["evolucao", "Evolução do estoque"],
  ["es", "Entradas x saídas"], ["consumo", "Análise de consumo"], ["sazonal", "Análise de sazonalidade"],
  ["critico", "Estoque crítico"], ["parado", "Estoque parado"], ["cobertura", "Cobertura de estoque"],
  ["anomalias", "Anomalias"], ["insights", "Insights"], ["historico", "Histórico detalhado"],
] as const;
type Mod = (typeof MODULOS)[number][0];

const dadosQuery = {
  queryKey: ["analise-dados"],
  queryFn: async () => {
    const [m, e, s] = await Promise.all([
      supabase.from("materiais").select("id, codigo, descricao, unidade, estoque_minimo, created_at").order("codigo"),
      supabase.from("entradas").select("id, material_id, quantidade, custo_unitario, fornecedor, data"),
      supabase.from("saidas").select("id, material_id, quantidade, destino_tipo, destino_nome, data"),
    ]);
    if (m.error) throw m.error; if (e.error) throw e.error; if (s.error) throw s.error;
    return { mats: m.data as MatA[], ents: e.data as EntA[], sais: s.data as SaiA[] };
  },
};

const nivelCor: Record<Nivel, string> = { critico: "bg-brand text-brand-foreground", atencao: "bg-accent-warm text-ink", normal: "bg-mint/20 text-ink" };
const nivelTxt: Record<Nivel, string> = { critico: "Crítico", atencao: "Atenção", normal: "Normal" };
const Pill = ({ n }: { n: Nivel }) => <span className={`rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold ${nivelCor[n]}`}>{nivelTxt[n]}</span>;
const Tend = ({ l }: { l: LinhaMaterial }) =>
  l.tendencia === "alta" ? <span className="font-bold text-brand">▲ alta</span> : l.tendencia === "queda" ? <span className="font-bold text-sky">▼ queda</span> : l.tendencia === "estavel" ? <span className="text-ink/60">● estável</span> : <span className="text-ink/40">—</span>;

function Card({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-ink bg-white p-4 sm:p-6">
      <h2 className="font-display text-lg font-bold sm:text-xl">{titulo}</h2>
      {sub && <p className="text-sm text-ink/50">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Kpi({ label, valor, delta, alerta }: { label: string; valor: string; delta?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 border-ink p-3 ${alerta ? "bg-accent-warm" : "bg-paper"}`}>
      <p className="text-xs font-medium text-ink/60">{label}</p>
      <p className="font-display text-2xl font-bold">{valor}</p>
      {delta && <p className="text-xs text-ink/60">{delta}</p>}
    </div>
  );
}
function Tabela({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="text-sm text-ink/50">Nenhum registro.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead><tr className="border-b-2 border-ink text-left">{cols.map((c) => <th key={c} className="px-2 py-2 font-bold">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-ink/10">{r.map((c, j) => <td key={j} className="px-2 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
function Detalhe({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-4 rounded-2xl border-2 border-ink/15 p-3">
      <summary className="cursor-pointer text-sm font-bold">{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const atalhos = [["30 dias", 30], ["90 dias", 90], ["6 meses", 182], ["12 meses", 365]] as const;

function Relatorios() {
  const { data, isLoading, error } = useQuery(dadosQuery);
  const hoje = iso(Date.now());
  const [f, setF] = useState<Filtros>({ inicio: iso(Date.now() - 29 * 86400000), fim: hoje, materiais: [], tipo: "todas", destino: "todos" });
  const [mods, setMods] = useState<Mod[]>(MODULOS.filter(([k]) => k !== "historico").map(([k]) => k));
  const [paradoSel, setParadoSel] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const a = useMemo(() => (data ? analisar(data.mats, data.ents, data.sais, f) : null), [data, f]);

  const exportar = async (tipo: "xlsx" | "csv" | "pdf") => {
    if (!a || !data) return;
    if (!mods.length) { toast.error("Selecione ao menos um módulo."); return; }
    setOcupado(true);
    try {
      const secoes = await montarSecoes(a, mods, data.mats);
      if (tipo === "xlsx") await baixarXlsx(secoes);
      else if (tipo === "csv") baixarCsv(secoes);
      else await baixarPdf(a, secoes, mods, data.mats);
      toast.success("Relatório gerado.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o relatório.");
    } finally { setOcupado(false); }
  };

  const on = (m: Mod) => mods.includes(m);
  const matNome = (id: string) => data?.mats.find((m) => m.id === id)?.codigo ?? "";

  return (
    <AppLayout>
      <PageTitle kicker="Inteligência do estoque" title="Análise e relatórios" />
      <div className="space-y-5">
        <section className="space-y-4 rounded-3xl border-2 border-ink bg-white p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {atalhos.map(([l, dias]) => (
              <button key={l} onClick={() => setF({ ...f, inicio: iso(Date.now() - (dias - 1) * 86400000), fim: hoje })} className="rounded-full border-2 border-ink px-3 py-1 text-sm font-bold hover:bg-accent-warm">{l}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-medium">De<input type="date" value={f.inicio} max={f.fim} onChange={(e) => e.target.value && setF({ ...f, inicio: e.target.value })} className="mt-1 w-full rounded-xl border-2 border-ink px-3 py-2" /></label>
            <label className="text-sm font-medium">Até<input type="date" value={f.fim} min={f.inicio} onChange={(e) => e.target.value && setF({ ...f, fim: e.target.value })} className="mt-1 w-full rounded-xl border-2 border-ink px-3 py-2" /></label>
            <label className="text-sm font-medium">Material
              <select value={f.materiais[0] ?? ""} onChange={(e) => setF({ ...f, materiais: e.target.value ? [e.target.value] : [] })} className="mt-1 w-full rounded-xl border-2 border-ink bg-white px-3 py-2">
                <option value="">Todos</option>
                {data?.mats.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.descricao}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Movimentação
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Filtros["tipo"] })} className="mt-1 w-full rounded-xl border-2 border-ink bg-white px-3 py-2">
                <option value="todas">Entradas e saídas</option><option value="entradas">Somente entradas</option><option value="saidas">Somente saídas</option>
              </select>
            </label>
            <label className="text-sm font-medium">Destino das saídas
              <select value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value as Filtros["destino"] })} className="mt-1 w-full rounded-xl border-2 border-ink bg-white px-3 py-2">
                <option value="todos">Todos</option><option value="unidade">Unidades</option><option value="pessoa">Pessoas</option>
              </select>
            </label>
          </div>
          {a && <p className="text-xs text-ink/50">Comparando {dataBR(f.inicio)}–{dataBR(f.fim)} ({a.dias} dias) com {dataBR(a.antInicio)}–{dataBR(a.antFim)}. Os materiais ainda não têm categoria cadastrada, por isso não há filtro por categoria.</p>}
        </section>

        {isLoading && <p className="text-ink/60">Carregando dados…</p>}
        {error && <p className="text-brand">Não foi possível carregar os dados.</p>}

        {a && (
          <>
            <Card titulo="Resumo do período" sub="Gerado automaticamente a partir dos dados registrados">
              <ul className="space-y-2">{a.resumo.map((r) => <li key={r} className="flex gap-2 text-sm sm:text-base"><span className="text-brand">■</span>{r}</li>)}</ul>
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Itens em estoque" valor={n0(a.kpis.estoqueTotal)} delta={moeda(a.kpis.valorEstoque) + " a custo médio"} />
              <Kpi label="Entradas no período" valor={n0(a.kpis.entradas)} delta={`anterior: ${n0(a.kpis.entradasAnt)} (${pctTxt(a.kpis.entradasAnt ? ((a.kpis.entradas - a.kpis.entradasAnt) / a.kpis.entradasAnt) * 100 : null)})`} />
              <Kpi label="Saídas no período" valor={n0(a.kpis.saidas)} delta={`anterior: ${n0(a.kpis.saidasAnt)} (${pctTxt(a.kpis.saidasAnt ? ((a.kpis.saidas - a.kpis.saidasAnt) / a.kpis.saidasAnt) * 100 : null)})`} />
              <Kpi label="Variação líquida" valor={`${a.kpis.liquida >= 0 ? "+" : ""}${n0(a.kpis.liquida)}`} delta="entradas − saídas" alerta={a.kpis.liquida < 0} />
              <Kpi label="Abaixo do mínimo" valor={n0(a.kpis.abaixoMinimo)} delta={`de ${a.kpis.materiais} materiais`} alerta={a.kpis.abaixoMinimo > 0} />
              <Kpi label="Sem movimentação ≥30 dias" valor={n0(a.kpis.semMov)} delta="com saldo em estoque" alerta={a.kpis.semMov > 0} />
              <Kpi label="Maior estoque" valor={[...a.linhas].sort((x, y) => y.saldo - x.saldo)[0]?.codigo ?? "—"} delta={`${n0([...a.linhas].sort((x, y) => y.saldo - x.saldo)[0]?.saldo ?? 0)} un.`} />
              <Kpi label="Menor estoque" valor={[...a.linhas].sort((x, y) => x.saldo - y.saldo)[0]?.codigo ?? "—"} delta={`${n0([...a.linhas].sort((x, y) => x.saldo - y.saldo)[0]?.saldo ?? 0)} un.`} />
            </div>

            <Card titulo="Comportamentos que merecem atenção" sub="Identificados automaticamente; não indicam causas">
              {a.alertas.length ? (
                <ul className="space-y-3">{a.alertas.slice(0, 12).map((al, i) => (
                  <li key={i} className="rounded-2xl border-2 border-ink/15 p-3">
                    <div className="flex flex-wrap items-center gap-2"><Pill n={al.nivel} /><span className="font-bold">{al.titulo}</span></div>
                    <p className="mt-1 text-sm">{al.texto}</p>
                    <p className="text-xs text-ink/50">Período: {al.periodo}</p>
                  </li>
                ))}</ul>
              ) : <p className="text-sm text-ink/60">Nenhum comportamento fora do padrão encontrado nos dados deste período.</p>}
            </Card>

            <Card titulo="Insights" sub="Cada frase é calculada com os dados reais do sistema">
              {a.insights.length ? <ul className="space-y-2">{a.insights.map((t) => <li key={t} className="rounded-xl bg-paper px-3 py-2 text-sm">{t}</li>)}</ul> : <p className="text-sm text-ink/60">Dados insuficientes no período para gerar insights.</p>}
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card titulo="Evolução do estoque" sub="Saldo total de unidades ao longo do período">
                <div className="h-64"><ResponsiveContainer><LineChart data={a.evolucao}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink)" strokeOpacity={0.1} /><XAxis dataKey="data" fontSize={11} minTickGap={30} /><YAxis fontSize={11} width={40} /><Tooltip /><Line type="monotone" dataKey="saldo" name="Saldo" stroke="var(--color-brand)" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div>
              </Card>
              <Card titulo="Entradas x saídas por mês" sub="Quantidades no período selecionado">
                <div className="h-64"><ResponsiveContainer><BarChart data={a.mensal}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-ink)" strokeOpacity={0.1} /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} width={40} /><Tooltip /><Legend />
                  {f.tipo !== "saidas" && <Bar dataKey="entradas" name="Entradas" fill="var(--color-mint)" radius={[6, 6, 0, 0]} />}
                  {f.tipo !== "entradas" && <Bar dataKey="saidas" name="Saídas" fill="var(--color-brand)" radius={[6, 6, 0, 0]} />}
                </BarChart></ResponsiveContainer></div>
              </Card>
            </div>

            <Card titulo="Análise de consumo" sub={a.pareto ? `Os ${a.pareto.top} mais consumidos representam ${n0(a.pareto.share)}% das saídas do período` : "Ranking por saídas no período"}>
              <Tabela cols={["#", "Material", "Consumo", "Anterior", "Variação", "Tendência", "Média/mês", "Frequência", "Saldo", "Últ. mov.", "Recebido ÷ consumido"]}
                rows={[...a.linhas].filter((l) => l.saidasPer || l.saidasAnt).sort((x, y) => y.saidasPer - x.saidasPer).map((l, i) => [
                  i + 1, <span key="m"><b>{l.codigo}</b> {l.descricao}</span>, n0(l.saidasPer), n0(l.saidasAnt), pctTxt(l.varPct), <Tend key="t" l={l} />,
                  l.consumoMensal === null ? "—" : n1(l.consumoMensal), `${l.frequencia}×`, n0(l.saldo), l.ultimaMov ? dataBR(l.ultimaMov) : "—",
                  l.saidasPer ? n2(l.entradasPer / l.saidasPer) : "—",
                ])} />
            </Card>

            <Card titulo="Estoque crítico e cobertura" sub="Cruza saldo, estoque mínimo e consumo médio. Cobertura = saldo ÷ consumo médio mensal (estimativa)">
              <Tabela cols={["Nível", "Material", "Saldo", "Mínimo", "Consumo médio/mês", "Cobertura estimada", "Motivo"]}
                rows={[...a.linhas].sort((x, y) => ({ critico: 0, atencao: 1, normal: 2 })[x.nivel] - ({ critico: 0, atencao: 1, normal: 2 })[y.nivel] || (x.cobertura ?? 999) - (y.cobertura ?? 999)).map((l) => [
                  <Pill key="p" n={l.nivel} />, <span key="m"><b>{l.codigo}</b> {l.descricao}</span>, n0(l.saldo), n0(l.minimo),
                  l.consumoMensal === null ? "dados insuficientes" : n1(l.consumoMensal), l.cobertura === null ? "—" : `${n1(l.cobertura)} mês(es)`, l.motivoNivel,
                ])} />
            </Card>

            <Card titulo="Estoque parado" sub="Materiais com saldo e sem movimentação. Clique numa faixa para ver os materiais">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {a.parados.map((p) => (
                  <button key={p.min} onClick={() => setParadoSel(paradoSel === p.min ? null : p.min)} className={`rounded-2xl border-2 border-ink p-3 text-left ${paradoSel === p.min ? "bg-accent-warm" : "bg-paper"}`}>
                    <p className="text-xs font-medium text-ink/60">{p.faixa}</p>
                    <p className="font-display text-2xl font-bold">{p.materiais.length}</p>
                    <p className="text-xs text-ink/60">{n0(p.unidades)} un. · {n1(p.pct)}% do estoque</p>
                  </button>
                ))}
              </div>
              {paradoSel !== null && (
                <div className="mt-4"><Tabela cols={["Material", "Saldo", "Dias parado", "Última movimentação"]} rows={(a.parados.find((p) => p.min === paradoSel)?.materiais ?? []).map((l) => [`${l.codigo} — ${l.descricao}`, n0(l.saldo), n0(l.diasParado), l.ultimaMov ? dataBR(l.ultimaMov) : "nunca movimentado"])} /></div>
              )}
              {a.estoqueAltoBaixoConsumo.length > 0 && (
                <Detalhe label={`Estoque elevado com baixo consumo (${a.estoqueAltoBaixoConsumo.length})`}>
                  <Tabela cols={["Material", "Saldo", "Mínimo", "Consumo médio/mês", "Cobertura"]} rows={a.estoqueAltoBaixoConsumo.map((l) => [`${l.codigo} — ${l.descricao}`, n0(l.saldo), n0(l.minimo), l.consumoMensal === null ? "sem consumo" : n1(l.consumoMensal), l.cobertura === null ? "—" : `${n1(l.cobertura)} meses`])} />
                </Detalhe>
              )}
            </Card>

            <Card titulo="Análise de sazonalidade" sub="Índice = consumo médio do mês ÷ média mensal histórica. Só é calculado com o mesmo mês observado em 2 anos ou mais">
              {a.sazonalMsg && <p className="rounded-xl bg-paper px-3 py-2 text-sm">{a.sazonalMsg}</p>}
              {a.sazonal.length > 0 && (
                <Tabela cols={["Material", "Média/mês", "Pico", "Vale", "Índice pico", "Variação", "Anos / meses", "Confiança", "Próximo mês", "Cobertura sazonal"]}
                  rows={a.sazonal.map((s) => [`${s.codigo} — ${s.descricao}`, n1(s.mediaMensal), MESES[s.mesPico], MESES[s.mesVale], n2(s.indicePico), pctTxt(s.varPct),
                    `${s.anos} / ${s.meses}`, s.tendencia ? "tendência, não sazonal" : s.confianca, s.indiceProximo === null ? "—" : n2(s.indiceProximo), s.coberturaSazonal === null ? "—" : `${n1(s.coberturaSazonal)} mês(es)`])} />
              )}
              {a.mesesPorAno.length > 0 && (
                <Detalhe label="Consumo por mês e trimestre em cada ano">
                  <Tabela cols={["Ano", ...MESES]} rows={a.mesesPorAno.map((r) => [r.ano, ...r.valores.map((v) => (v === null ? "—" : n0(v)))])} />
                  <div className="mt-3"><Tabela cols={["Ano", "T1", "T2", "T3", "T4"]} rows={a.trimestres.map((r) => [r.ano, ...r.valores.map((v) => (v === null ? "—" : n0(v)))])} /></div>
                </Detalhe>
              )}
            </Card>

            <Card titulo="Movimentações detalhadas" sub="Registros do período com os filtros aplicados">
              <Detalhe label={`Entradas (${a.entradasFiltradas.length})`}>
                <Tabela cols={["Data", "Material", "Qtd.", "Custo un.", "Fornecedor"]} rows={[...a.entradasFiltradas].sort((x, y) => y.data.localeCompare(x.data)).map((e) => [dataBR(e.data), matNome(e.material_id), n0(e.quantidade), moeda(Number(e.custo_unitario)), e.fornecedor ?? ""])} />
              </Detalhe>
              <Detalhe label={`Saídas (${a.saidasFiltradas.length})`}>
                <Tabela cols={["Data", "Material", "Qtd.", "Tipo", "Destino"]} rows={[...a.saidasFiltradas].sort((x, y) => y.data.localeCompare(x.data)).map((s) => [dataBR(s.data), matNome(s.material_id), n0(s.quantidade), s.destino_tipo === "unidade" ? "Unidade" : "Pessoa", s.destino_nome])} />
              </Detalhe>
            </Card>

            <section className="space-y-4 rounded-3xl border-2 border-ink bg-accent-warm/40 p-4 sm:p-6">
              <div><h2 className="font-display text-xl font-bold">Gerar relatório</h2><p className="text-sm text-ink/60">Usa o período e os filtros acima. Escolha os módulos.</p></div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {MODULOS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMods((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-medium ${on(k) ? "border-ink bg-white" : "border-ink/15 bg-paper"}`}>
                    <span className={`grid size-5 place-items-center rounded-md border-2 border-ink text-xs font-bold ${on(k) ? "bg-ink text-paper" : ""}`}>{on(k) ? "✓" : ""}</span>{l}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button disabled={ocupado} onClick={() => exportar("pdf")} className="rounded-full border-2 border-ink bg-brand px-5 py-2.5 font-bold text-brand-foreground disabled:opacity-50">Baixar PDF</button>
                <button disabled={ocupado} onClick={() => exportar("xlsx")} className="rounded-full border-2 border-ink bg-white px-5 py-2.5 font-bold disabled:opacity-50">Baixar Excel</button>
                <button disabled={ocupado} onClick={() => exportar("csv")} className="rounded-full border-2 border-ink bg-white px-5 py-2.5 font-bold disabled:opacity-50">Baixar CSV</button>
              </div>
              <p className="text-xs text-ink/50">A planilha pode ser aberta no Google Planilhas (Arquivo → Importar).</p>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ---------- exportação ----------
type Secao = { nome: string; colunas: string[]; linhas: (string | number)[][] };

async function montarSecoes(a: Analise, mods: Mod[], mats: MatA[]): Promise<Secao[]> {
  const cod = (id: string) => mats.find((m) => m.id === id);
  const out: Secao[] = [];
  const has = (m: Mod) => mods.includes(m);
  if (has("resumo")) out.push({ nome: "Resumo", colunas: ["Resumo do período"], linhas: a.resumo.map((r) => [r]) });
  if (has("kpis")) out.push({ nome: "Indicadores", colunas: ["Indicador", "Período", "Período anterior"], linhas: [
    ["Itens em estoque", a.kpis.estoqueTotal, ""], ["Valor do estoque (custo médio)", Number(a.kpis.valorEstoque.toFixed(2)), ""],
    ["Entradas", a.kpis.entradas, a.kpis.entradasAnt], ["Saídas", a.kpis.saidas, a.kpis.saidasAnt], ["Variação líquida", a.kpis.liquida, a.kpis.entradasAnt - a.kpis.saidasAnt],
    ["Abaixo do mínimo", a.kpis.abaixoMinimo, ""], ["Sem movimentação ≥30 dias", a.kpis.semMov, ""],
  ] });
  if (has("evolucao")) out.push({ nome: "Evolução", colunas: ["Data", "Saldo total"], linhas: a.evolucao.map((e) => [e.data, e.saldo]) });
  if (has("es")) out.push({ nome: "Entradas x saídas", colunas: ["Mês", "Entradas", "Saídas", "Líquido"], linhas: a.mensal.map((m) => [m.mes, m.entradas, m.saidas, m.liquido]) });
  if (has("consumo")) out.push({ nome: "Consumo", colunas: ["Código", "Descrição", "Consumo", "Anterior", "Variação %", "Tendência", "Média/mês", "Frequência", "Saldo", "Última mov."],
    linhas: [...a.linhas].sort((x, y) => y.saidasPer - x.saidasPer).map((l) => [l.codigo, l.descricao, l.saidasPer, l.saidasAnt, l.varPct === null ? "—" : Math.round(l.varPct), l.tendencia.replace("_", " "), l.consumoMensal === null ? "—" : Number(l.consumoMensal.toFixed(1)), l.frequencia, l.saldo, l.ultimaMov ? dataBR(l.ultimaMov) : "—"]) });
  if (has("sazonal")) out.push(a.sazonal.length
    ? { nome: "Sazonalidade", colunas: ["Código", "Descrição", "Média/mês", "Mês pico", "Mês vale", "Índice pico", "Variação %", "Anos", "Confiança", "Observação"],
      linhas: a.sazonal.map((s) => [s.codigo, s.descricao, Number(s.mediaMensal.toFixed(1)), MESES[s.mesPico]!, MESES[s.mesVale]!, Number(s.indicePico.toFixed(2)), Math.round(s.varPct), s.anos, s.confianca, s.tendencia ? "Tendência contínua, não sazonalidade" : ""]) }
    : { nome: "Sazonalidade", colunas: ["Observação"], linhas: [[a.sazonalMsg ?? ""]] });
  if (has("critico")) out.push({ nome: "Estoque crítico", colunas: ["Nível", "Código", "Descrição", "Saldo", "Mínimo", "Motivo"], linhas: a.linhas.filter((l) => l.nivel !== "normal").map((l) => [nivelTxt[l.nivel], l.codigo, l.descricao, l.saldo, l.minimo, l.motivoNivel]) });
  if (has("parado")) out.push({ nome: "Estoque parado", colunas: ["Faixa", "Código", "Descrição", "Saldo", "Dias parado", "Última mov."], linhas: a.parados.flatMap((p) => p.materiais.map((l) => [p.faixa, l.codigo, l.descricao, l.saldo, l.diasParado, l.ultimaMov ? dataBR(l.ultimaMov) : "nunca"])) });
  if (has("cobertura")) out.push({ nome: "Cobertura", colunas: ["Código", "Descrição", "Saldo", "Consumo médio/mês", "Cobertura estimada (meses)"], linhas: a.linhas.map((l) => [l.codigo, l.descricao, l.saldo, l.consumoMensal === null ? "dados insuficientes" : Number(l.consumoMensal.toFixed(1)), l.cobertura === null ? "—" : Number(l.cobertura.toFixed(1))]) });
  if (has("anomalias")) out.push({ nome: "Anomalias", colunas: ["Nível", "Comportamento", "Detalhe", "Período", "Materiais"], linhas: a.alertas.map((x) => [nivelTxt[x.nivel], x.titulo, x.texto, x.periodo, x.materiais.join(", ")]) });
  if (has("insights")) out.push({ nome: "Insights", colunas: ["Insight"], linhas: a.insights.map((i) => [i]) });
  if (has("historico")) {
    out.push({ nome: "Entradas", colunas: ["Data", "Código", "Quantidade", "Custo unitário", "Fornecedor"], linhas: a.entradasFiltradas.map((e) => [dataBR(e.data), cod(e.material_id)?.codigo ?? "", e.quantidade, Number(e.custo_unitario), e.fornecedor ?? ""]) });
    out.push({ nome: "Saídas", colunas: ["Data", "Código", "Quantidade", "Tipo", "Destino"], linhas: a.saidasFiltradas.map((s) => [dataBR(s.data), cod(s.material_id)?.codigo ?? "", s.quantidade, s.destino_tipo === "unidade" ? "Unidade" : "Pessoa", s.destino_nome]) });
    const [h, p] = await Promise.all([
      supabase.from("historico").select("*").gte("created_at", `${a.filtros.inicio}T00:00:00`).lte("created_at", `${a.filtros.fim}T23:59:59`).order("created_at", { ascending: false }).limit(2000),
      supabase.from("profiles").select("id, nome, email"),
    ]);
    if (h.error) throw h.error;
    const acao: Record<string, string> = { INSERT: "Criou", UPDATE: "Editou", DELETE: "Excluiu" };
    const tab: Record<string, string> = { materiais: "Produto", entradas: "Entrada", saidas: "Saída" };
    out.push({ nome: "Histórico", colunas: ["Quando", "Usuário", "Ação", "Tipo", "Detalhes"], linhas: (h.data ?? []).map((x) => {
      const u = (p.data ?? []).find((y) => y.id === x.user_id);
      const r = ((x.depois ?? x.antes ?? {}) as Record<string, string | number | undefined>);
      return [new Date(x.created_at).toLocaleString("pt-BR"), u ? (u.nome ?? u.email) : "Sistema", acao[x.acao] ?? x.acao, tab[x.tabela] ?? x.tabela,
        r["codigo"] ? `${r["codigo"]} — ${r["descricao"]}` : `${r["quantidade"] ?? ""} un.${r["destino_nome"] ? ` para ${r["destino_nome"]}` : ""}`];
    }) });
  }
  return out;
}

const nomeArquivo = () => `analise-estoque-${new Date().toISOString().slice(0, 10)}`;
const filtrosTxt = (a: Analise, mats: MatA[]) => {
  const m = a.filtros.materiais.length ? mats.filter((x) => a.filtros.materiais.includes(x.id)).map((x) => x.codigo).join(", ") : "todos";
  const t = { todas: "entradas e saídas", entradas: "somente entradas", saidas: "somente saídas" }[a.filtros.tipo];
  const d = { todos: "todos", unidade: "unidades", pessoa: "pessoas" }[a.filtros.destino];
  return `Materiais: ${m} · Movimentação: ${t} · Destino: ${d}`;
};

async function baixarXlsx(secoes: Secao[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  secoes.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet([s.colunas, ...s.linhas]);
    ws["!cols"] = s.colunas.map((c) => ({ wch: s.colunas.length === 1 ? 110 : Math.max(14, c.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, s.nome.slice(0, 31));
  });
  XLSX.writeFile(wb, `${nomeArquivo()}.xlsx`);
}

function baixarCsv(secoes: Secao[]) {
  const esc = (v: string | number) => { const t = String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const txt = secoes.map((s) => [[`## ${s.nome}`], s.colunas, ...s.linhas].map((l) => l.map(esc).join(";")).join("\n")).join("\n\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + txt], { type: "text/csv;charset=utf-8" }));
  const el = document.createElement("a"); el.href = url; el.download = `${nomeArquivo()}.csv`; el.click();
  URL.revokeObjectURL(url);
}

async function baixarPdf(a: Analise, secoes: Secao[], mods: Mod[], mats: MatA[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const brand: [number, number, number] = [255, 90, 60], ink: [number, number, number] = [23, 19, 31];
  // capa
  doc.setFillColor(...brand); doc.rect(0, 0, W, 48, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.text("Análise gerencial do estoque", 14, 24);
  doc.setFontSize(11); doc.text("Marketing Modular", 14, 34);
  doc.setTextColor(...ink); doc.setFontSize(10);
  doc.text(`Período analisado: ${dataBR(a.filtros.inicio)} a ${dataBR(a.filtros.fim)} (${a.dias} dias) · comparado com ${dataBR(a.antInicio)} a ${dataBR(a.antFim)}`, 14, 58);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 64);
  doc.text(filtrosTxt(a, mats), 14, 70);
  let y = 82;
  if (mods.includes("kpis")) {
    const k = [["Itens em estoque", n0(a.kpis.estoqueTotal)], ["Entradas", n0(a.kpis.entradas)], ["Saídas", n0(a.kpis.saidas)], ["Variação líquida", `${a.kpis.liquida >= 0 ? "+" : ""}${n0(a.kpis.liquida)}`], ["Abaixo do mínimo", n0(a.kpis.abaixoMinimo)], ["Parados ≥30 dias", n0(a.kpis.semMov)]];
    const w = (W - 28 - 5 * 4) / 6;
    k.forEach(([l, v], i) => {
      const x = 14 + i * (w + 4);
      doc.setDrawColor(...ink); doc.setLineWidth(0.5); doc.roundedRect(x, y, w, 22, 3, 3);
      doc.setFontSize(8); doc.text(l!, x + 3, y + 7); doc.setFontSize(15); doc.text(v!, x + 3, y + 17);
    });
    y += 32;
  }
  if (mods.includes("resumo")) {
    doc.setFontSize(13); doc.text("Resumo do período", 14, y); y += 6; doc.setFontSize(10);
    a.resumo.forEach((r) => { const ls = doc.splitTextToSize(`• ${r}`, W - 28); doc.text(ls, 14, y); y += ls.length * 5 + 1; });
  }
  if (mods.includes("es") && a.mensal.length) {
    doc.addPage(); doc.setFontSize(13); doc.text("Entradas x saídas por mês", 14, 16);
    const max = Math.max(1, ...a.mensal.flatMap((m) => [m.entradas, m.saidas]));
    const H = 90, base = 120, slot = Math.min(40, (W - 40) / a.mensal.length), bw = slot * 0.35;
    doc.setFontSize(8);
    a.mensal.forEach((m, i) => {
      const x = 24 + i * slot;
      const he = (m.entradas / max) * H, hs = (m.saidas / max) * H;
      doc.setFillColor(34, 197, 94); doc.rect(x, base - he, bw, he, "F");
      doc.setFillColor(...brand); doc.rect(x + bw + 1, base - hs, bw, hs, "F");
      doc.text(m.mes, x, base + 5);
    });
    doc.setDrawColor(...ink); doc.line(20, base, W - 14, base);
    doc.setFillColor(34, 197, 94); doc.rect(14, 24, 4, 4, "F"); doc.text("Entradas", 20, 27.5);
    doc.setFillColor(...brand); doc.rect(44, 24, 4, 4, "F"); doc.text("Saídas", 50, 27.5);
    y = base + 14;
    doc.setFontSize(10);
    a.insights.slice(0, 2).forEach((t) => { const ls = doc.splitTextToSize(t, W - 28); doc.text(ls, 14, y); y += ls.length * 5 + 2; });
  }
  secoes.filter((s) => s.nome !== "Resumo" && s.nome !== "Indicadores").forEach((s) => {
    doc.addPage(); doc.setFontSize(13); doc.setTextColor(...ink); doc.text(s.nome, 14, 16);
    autoTable(doc, {
      startY: 21, head: [s.colunas],
      body: s.linhas.length ? s.linhas.map((l) => l.map((v) => (typeof v === "number" && !Number.isInteger(v) ? n2(v) : String(v)))) : [["Sem dados suficientes para esta análise no período."]],
      styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: brand, textColor: 255 }, alternateRowStyles: { fillColor: [251, 247, 241] },
    });
  });
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Estoque de Marketing Modular · página ${i} de ${total}`, 14, doc.internal.pageSize.getHeight() - 6); }
  doc.save(`${nomeArquivo()}.pdf`);
}
