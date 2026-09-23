import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import {
  estoqueQuery,
  saidasQuery,
  moeda,
  numero,
  statusLabel,
  type EstoqueRow,
} from "@/lib/estoque";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de estoque — Estoque de Marketing Modular" },
      {
        name: "description",
        content:
          "Painel de controle do estoque de materiais e brindes do marketing da Modular: saldos, custos e status por produto.",
      },
      { property: "og:title", content: "Painel de estoque — Estoque de Marketing Modular" },
      {
        property: "og:description",
        content: "Saldos, custos e status de cada material de marketing da Modular.",
      },
    ],
  }),
  component: Painel,
});

const statusChip: Record<EstoqueRow["status"], string> = {
  em_estoque: "bg-mint/15 text-mint",
  baixo: "bg-brand/15 text-brand",
  esgotado: "bg-ink/10 text-ink/60",
};

function Painel() {
  const [busca, setBusca] = useState("");
  const estoque = useQuery(estoqueQuery);
  const saidas = useQuery(saidasQuery);

  const rows = (estoque.data ?? []).filter(
    (r) =>
      r.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      r.descricao.toLowerCase().includes(busca.toLowerCase()),
  );

  const itens = (estoque.data ?? []).reduce((a, r) => a + r.saldo_total, 0);
  const gasto = (estoque.data ?? []).reduce((a, r) => a + Number(r.total_gasto), 0);
  const restante = (estoque.data ?? []).reduce((a, r) => a + Number(r.saldo_restante), 0);

  return (
    <AppLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          kicker="Painel de controle"
          title={
            <>
              Estoque de
              <br />
              Marketing
            </>
          }
        />
        <div className="flex flex-wrap gap-3">
          <div className="rounded-3xl border-2 border-ink bg-white px-6 py-4">
            <p className="text-xs font-medium text-ink/50">Itens em estoque</p>
            <p className="font-display text-3xl font-bold">{numero(itens)}</p>
          </div>
          <div className="rounded-3xl border-2 border-ink bg-accent-warm px-6 py-4">
            <p className="text-xs font-medium text-ink/60">Total gasto</p>
            <p className="font-display text-3xl font-bold">{moeda(gasto)}</p>
          </div>
          <div className="rounded-3xl border-2 border-ink bg-brand px-6 py-4 text-brand-foreground">
            <p className="text-xs font-medium text-brand-foreground/70">Saldo restante</p>
            <p className="font-display text-3xl font-bold">{moeda(restante)}</p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border-2 border-ink bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink/10 px-6 py-4">
          <h2 className="font-display text-xl font-bold">Materiais do estoque</h2>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material…"
            className="rounded-full border-2 border-ink px-4 py-2 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/10 text-left text-[11px] uppercase tracking-wider text-ink/40">
                <th className="px-6 py-3 font-semibold">Cód. Produto</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 text-right font-semibold">Entradas</th>
                <th className="px-4 py-3 text-right font-semibold">Saídas</th>
                <th className="px-4 py-3 text-right font-semibold">Custo entrada</th>
                <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                <th className="px-4 py-3 text-right font-semibold">Total comprado</th>
                <th className="px-4 py-3 text-right font-semibold">Total gasto</th>
                <th className="px-4 py-3 text-right font-semibold">Saldo restante</th>
                <th className="px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {estoque.isLoading && (
                <tr>
                  <td className="px-6 py-6 text-ink/50" colSpan={10}>
                    Carregando materiais…
                  </td>
                </tr>
              )}
              {!estoque.isLoading && rows.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-ink/50" colSpan={10}>
                    Nenhum material encontrado.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 hover:bg-paper">
                  <td className="px-6 py-4 font-display font-semibold">{r.codigo}</td>
                  <td className="px-4 py-4 font-medium">{r.descricao}</td>
                  <td className="px-4 py-4 text-right">{numero(r.total_entradas)}</td>
                  <td className="px-4 py-4 text-right">{numero(r.total_saidas)}</td>
                  <td className="px-4 py-4 text-right">{moeda(Number(r.custo_medio))}</td>
                  <td className="px-4 py-4 text-right font-display font-bold">
                    {numero(r.saldo_total)}
                  </td>
                  <td className="px-4 py-4 text-right">{moeda(Number(r.total_comprado))}</td>
                  <td className="px-4 py-4 text-right">{moeda(Number(r.total_gasto))}</td>
                  <td className="px-4 py-4 text-right">{moeda(Number(r.saldo_restante))}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${statusChip[r.status]}`}
                    >
                      {statusLabel[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-ink bg-white p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Saídas recentes</h2>
        <div className="space-y-3">
          {(saidas.data ?? []).slice(0, 5).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3"
            >
              <div>
                <p className="font-medium">{s.materiais?.descricao}</p>
                <p className="text-xs text-ink/50">Para {s.destino_nome}</p>
              </div>
              <span className="font-display font-bold text-brand">-{numero(s.quantidade)}</span>
            </div>
          ))}
          {!saidas.isLoading && (saidas.data ?? []).length === 0 && (
            <p className="text-sm text-ink/50">Nenhuma saída registrada ainda.</p>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
