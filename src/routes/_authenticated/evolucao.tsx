import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { entradasQuery, materiaisQuery, moeda, dataBR } from "@/lib/estoque";

export const Route = createFileRoute("/_authenticated/evolucao")({
  head: () => ({
    meta: [
      { title: "Evolução de valor — Estoque de Marketing Modular" },
      {
        name: "description",
        content:
          "Acompanhe como o custo de cada material ou brinde do marketing da Modular variou a cada compra.",
      },
      { property: "og:title", content: "Evolução de valor — Estoque de Marketing Modular" },
      {
        property: "og:description",
        content: "Histórico de variação do custo dos brindes e materiais de marketing.",
      },
    ],
  }),
  component: Evolucao,
});

function Evolucao() {
  const materiais = useQuery(materiaisQuery);
  const entradas = useQuery(entradasQuery);
  const [materialId, setMaterialId] = useState("");

  const lista = materiais.data ?? [];
  const atual = materialId || lista[0]?.id || "";
  const material = lista.find((m) => m.id === atual);

  const historico = (entradas.data ?? [])
    .filter((e) => e.material_id === atual)
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data));

  const pontos = historico.map((e) => ({
    data: dataBR(e.data),
    custo: Number(e.custo_unitario),
    quantidade: e.quantidade,
  }));

  const primeiro = pontos[0]?.custo ?? 0;
  const ultimo = pontos[pontos.length - 1]?.custo ?? 0;
  const variacao = primeiro > 0 ? ((ultimo - primeiro) / primeiro) * 100 : 0;

  return (
    <AppLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle kicker="Histórico de compras" title="Evolução de valor" />
        <select
          className="rounded-full border-2 border-ink bg-white px-4 py-2.5 text-sm outline-none"
          value={atual}
          onChange={(e) => setMaterialId(e.target.value)}
        >
          {lista.map((m) => (
            <option key={m.id} value={m.id}>
              {m.codigo} — {m.descricao}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-3xl border-2 border-ink bg-ink p-6 text-paper">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">
            {material ? material.descricao : "Selecione um material"}
          </h2>
          <span className="rounded-full bg-accent-warm px-3 py-1 text-xs font-semibold text-ink">
            {material?.codigo ?? "—"}
          </span>
        </div>
        <div className="h-72">
          {pontos.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pontos} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} />
                <XAxis
                  dataKey="data"
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  tickFormatter={(v: number) => moeda(v)}
                  width={90}
                />
                <Tooltip
                  formatter={(v: number) => moeda(v)}
                  contentStyle={{
                    borderRadius: 16,
                    border: "2px solid var(--ink)",
                    background: "var(--paper)",
                    color: "var(--ink)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="custo"
                  stroke="var(--accent-warm)"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "var(--brand)", stroke: "var(--brand)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-paper/60">
              Sem entradas registradas para este material ainda.
            </p>
          )}
        </div>
        {pontos.length > 1 && (
          <p className="mt-4 text-sm text-paper/60">
            O custo unitário foi de {moeda(primeiro)} para {moeda(ultimo)} —{" "}
            <span className="font-bold text-accent-warm">
              {variacao >= 0 ? "+" : ""}
              {variacao.toFixed(1)}%
            </span>{" "}
            no período.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border-2 border-ink bg-white">
        <div className="border-b-2 border-ink/10 px-6 py-4">
          <h2 className="font-display text-xl font-bold">Variação a cada compra</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/10 text-left text-[11px] uppercase tracking-wider text-ink/40">
                <th className="px-6 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 text-right font-semibold">Quantidade</th>
                <th className="px-4 py-3 text-right font-semibold">Custo unit.</th>
                <th className="px-4 py-3 text-right font-semibold">Variação</th>
                <th className="px-6 py-3 text-right font-semibold">Total da compra</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p, i) => {
                const anterior = i > 0 ? pontos[i - 1]!.custo : null;
                const delta = anterior ? ((p.custo - anterior) / anterior) * 100 : null;
                return (
                  <tr key={`${p.data}-${i}`} className="border-b border-ink/5 hover:bg-paper">
                    <td className="px-6 py-4">{p.data}</td>
                    <td className="px-4 py-4 text-right">{p.quantidade}</td>
                    <td className="px-4 py-4 text-right font-display font-bold">
                      {moeda(p.custo)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {delta === null ? (
                        <span className="text-ink/40">—</span>
                      ) : (
                        <span
                          className={
                            delta >= 0 ? "font-semibold text-brand" : "font-semibold text-mint"
                          }
                        >
                          {delta >= 0 ? "+" : ""}
                          {delta.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">{moeda(p.custo * p.quantidade)}</td>
                  </tr>
                );
              })}
              {pontos.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-ink/50" colSpan={5}>
                    Nenhuma compra registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppLayout>
  );
}
