import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { estoqueQuery, saidasQuery, moeda, numero, dataBR } from "@/lib/estoque";

export const Route = createFileRoute("/saidas")({
  head: () => ({
    meta: [
      { title: "Saídas e destinos — Estoque de Marketing Modular" },
      {
        name: "description",
        content:
          "Controle quantos materiais saíram do estoque de marketing e para qual unidade ou pessoa foram entregues.",
      },
      { property: "og:title", content: "Saídas e destinos — Estoque de Marketing Modular" },
      {
        property: "og:description",
        content: "Registro de saídas de materiais por unidade ou pessoa.",
      },
    ],
  }),
  component: Saidas,
});

const inputCls =
  "w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50";

function Saidas() {
  const qc = useQueryClient();
  const estoque = useQuery(estoqueQuery);
  const saidas = useQuery(saidasQuery);

  const [materialId, setMaterialId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [destinoTipo, setDestinoTipo] = useState<"unidade" | "pessoa">("unidade");
  const [destinoNome, setDestinoNome] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");

  const selecionado = (estoque.data ?? []).find((m) => m.id === materialId);

  const registrar = useMutation({
    mutationFn: async () => {
      const qtd = Number(quantidade);
      if (selecionado && qtd > selecionado.saldo_total) {
        throw new Error(
          `Saldo insuficiente: há apenas ${selecionado.saldo_total} unidade(s) em estoque.`,
        );
      }
      const { error } = await supabase.from("saidas").insert({
        material_id: materialId,
        quantidade: qtd,
        destino_tipo: destinoTipo,
        destino_nome: destinoNome.trim(),
        observacao: observacao || null,
        data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saída registrada.");
      setQuantidade("");
      setDestinoNome("");
      setObservacao("");
      qc.invalidateQueries({ queryKey: ["estoque"] });
      qc.invalidateQueries({ queryKey: ["saidas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const porDestino = Object.entries(
    (saidas.data ?? []).reduce<Record<string, number>>((acc, s) => {
      acc[s.destino_nome] = (acc[s.destino_nome] ?? 0) + s.quantidade;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <AppLayout>
      <PageTitle kicker="Distribuição" title="Saídas & unidades" />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border-2 border-ink bg-white p-6">
          <h2 className="mb-5 font-display text-xl font-bold">Registrar saída</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!materialId) {
                toast.error("Escolha um material.");
                return;
              }
              registrar.mutate();
            }}
          >
            <div>
              <label className={labelCls} htmlFor="material">
                Material
              </label>
              <select
                id="material"
                className={inputCls}
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {(estoque.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} — {m.descricao} (saldo {m.saldo_total})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="qtd">
                  Quantidade que saiu
                </label>
                <input
                  id="qtd"
                  type="number"
                  min="1"
                  required
                  className={inputCls}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="data">
                  Data da saída
                </label>
                <input
                  id="data"
                  type="date"
                  className={inputCls}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="tipo">
                  Tipo de destino
                </label>
                <select
                  id="tipo"
                  className={inputCls}
                  value={destinoTipo}
                  onChange={(e) => setDestinoTipo(e.target.value as "unidade" | "pessoa")}
                >
                  <option value="unidade">Unidade</option>
                  <option value="pessoa">Pessoa</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="destino">
                  {destinoTipo === "unidade" ? "Nome da unidade" : "Nome da pessoa"}
                </label>
                <input
                  id="destino"
                  required
                  className={inputCls}
                  value={destinoNome}
                  onChange={(e) => setDestinoNome(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="obs">
                Observação
              </label>
              <input
                id="obs"
                className={inputCls}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
            {selecionado && (
              <p className="text-sm text-ink/60">
                Saldo atual: <strong>{numero(selecionado.saldo_total)}</strong> · custo médio{" "}
                {moeda(Number(selecionado.custo_medio))}
              </p>
            )}
            <button
              type="submit"
              disabled={registrar.isPending}
              className="rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-paper disabled:opacity-60"
            >
              {registrar.isPending ? "Salvando…" : "Registrar saída"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border-2 border-ink bg-ink p-6 text-paper">
          <h2 className="mb-5 font-display text-xl font-bold">Total por destino</h2>
          <div className="space-y-3">
            {porDestino.map(([nome, qtd]) => (
              <div
                key={nome}
                className="flex items-center justify-between rounded-2xl bg-paper/10 px-4 py-3"
              >
                <p className="font-medium">{nome}</p>
                <span className="font-display font-bold text-accent-warm">{numero(qtd)}</span>
              </div>
            ))}
            {porDestino.length === 0 && (
              <p className="text-sm text-paper/60">Nenhuma saída registrada ainda.</p>
            )}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border-2 border-ink bg-white">
        <div className="border-b-2 border-ink/10 px-6 py-4">
          <h2 className="font-display text-xl font-bold">Histórico de saídas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/10 text-left text-[11px] uppercase tracking-wider text-ink/40">
                <th className="px-6 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Cód. Produto</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 text-right font-semibold">Quantidade</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-6 py-3 font-semibold">Destino</th>
              </tr>
            </thead>
            <tbody>
              {(saidas.data ?? []).map((s) => (
                <tr key={s.id} className="border-b border-ink/5 hover:bg-paper">
                  <td className="px-6 py-4">{dataBR(s.data)}</td>
                  <td className="px-4 py-4 font-display font-semibold">{s.materiais?.codigo}</td>
                  <td className="px-4 py-4 font-medium">{s.materiais?.descricao}</td>
                  <td className="px-4 py-4 text-right font-display font-bold text-brand">
                    -{numero(s.quantidade)}
                  </td>
                  <td className="px-4 py-4 capitalize text-ink/60">{s.destino_tipo}</td>
                  <td className="px-6 py-4 font-medium">{s.destino_nome}</td>
                </tr>
              ))}
              {!saidas.isLoading && (saidas.data ?? []).length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-ink/50" colSpan={6}>
                    Nenhuma saída registrada.
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
