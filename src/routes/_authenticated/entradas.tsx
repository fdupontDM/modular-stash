import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { entradasQuery, materiaisQuery, moeda, numero, dataBR } from "@/lib/estoque";

export const Route = createFileRoute("/_authenticated/entradas")({
  head: () => ({
    meta: [
      { title: "Entradas de materiais — Estoque de Marketing Modular" },
      {
        name: "description",
        content:
          "Registre materiais de marketing recebidos, com quantidade, custo unitário e fornecedor.",
      },
      { property: "og:title", content: "Entradas de materiais — Estoque de Marketing Modular" },
      {
        property: "og:description",
        content: "Cadastro de materiais recebidos e histórico de entradas do estoque.",
      },
    ],
  }),
  component: Entradas,
});

const inputCls =
  "w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50";

function Entradas() {
  const qc = useQueryClient();
  const materiais = useQuery(materiaisQuery);
  const entradas = useQuery(entradasQuery);

  const [materialId, setMaterialId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");

  const [novoCodigo, setNovoCodigo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoMinimo, setNovoMinimo] = useState("10");

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["estoque"] });
    qc.invalidateQueries({ queryKey: ["entradas"] });
    qc.invalidateQueries({ queryKey: ["materiais"] });
  };

  const criarEntrada = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("entradas").insert({
        material_id: materialId,
        quantidade: Number(quantidade),
        custo_unitario: Number(custo.replace(",", ".")),
        fornecedor: fornecedor || null,
        observacao: observacao || null,
        data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada registrada no estoque.");
      setQuantidade("");
      setCusto("");
      setObservacao("");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarMaterial = useMutation({
    mutationFn: async () => {
      const { data: row, error } = await supabase
        .from("materiais")
        .insert({
          codigo: novoCodigo.trim(),
          descricao: novaDescricao.trim(),
          estoque_minimo: Number(novoMinimo) || 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return row.id as string;
    },
    onSuccess: (id) => {
      toast.success("Material cadastrado.");
      setNovoCodigo("");
      setNovaDescricao("");
      setMaterialId(id);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppLayout>
      <PageTitle kicker="Materiais recebidos" title="Adicionar entradas" />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border-2 border-ink bg-white p-6">
          <h2 className="mb-5 font-display text-xl font-bold">Registrar entrada</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!materialId) {
                toast.error("Escolha um material.");
                return;
              }
              criarEntrada.mutate();
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
                {(materiais.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} — {m.descricao}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="qtd">
                  Quantidade recebida
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
                <label className={labelCls} htmlFor="custo">
                  Custo unitário (R$)
                </label>
                <input
                  id="custo"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className={inputCls}
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="fornecedor">
                  Fornecedor
                </label>
                <input
                  id="fornecedor"
                  className={inputCls}
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="data">
                  Data do recebimento
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
            <button
              type="submit"
              disabled={criarEntrada.isPending}
              className="rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-paper disabled:opacity-60"
            >
              {criarEntrada.isPending ? "Salvando…" : "Registrar entrada"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border-2 border-ink bg-accent-warm p-6">
          <h2 className="mb-5 font-display text-xl font-bold">Cadastrar novo material</h2>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              criarMaterial.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="codigo">
                  Cód. do Produto
                </label>
                <input
                  id="codigo"
                  required
                  placeholder="MK-045"
                  className={inputCls}
                  value={novoCodigo}
                  onChange={(e) => setNovoCodigo(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="minimo">
                  Estoque mínimo
                </label>
                <input
                  id="minimo"
                  type="number"
                  min="0"
                  className={inputCls}
                  value={novoMinimo}
                  onChange={(e) => setNovoMinimo(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="descricao">
                Descrição
              </label>
              <input
                id="descricao"
                required
                className={inputCls}
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={criarMaterial.isPending}
              className="rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-paper disabled:opacity-60"
            >
              {criarMaterial.isPending ? "Salvando…" : "Cadastrar material"}
            </button>
          </form>
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border-2 border-ink bg-white">
        <div className="border-b-2 border-ink/10 px-6 py-4">
          <h2 className="font-display text-xl font-bold">Histórico de entradas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/10 text-left text-[11px] uppercase tracking-wider text-ink/40">
                <th className="px-6 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Cód. Produto</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 font-semibold">Fornecedor</th>
                <th className="px-4 py-3 text-right font-semibold">Quantidade</th>
                <th className="px-4 py-3 text-right font-semibold">Custo unit.</th>
                <th className="px-6 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {(entradas.data ?? []).map((e) => (
                <tr key={e.id} className="border-b border-ink/5 hover:bg-paper">
                  <td className="px-6 py-4">{dataBR(e.data)}</td>
                  <td className="px-4 py-4 font-display font-semibold">{e.materiais?.codigo}</td>
                  <td className="px-4 py-4 font-medium">{e.materiais?.descricao}</td>
                  <td className="px-4 py-4 text-ink/60">{e.fornecedor ?? "—"}</td>
                  <td className="px-4 py-4 text-right">{numero(e.quantidade)}</td>
                  <td className="px-4 py-4 text-right">{moeda(Number(e.custo_unitario))}</td>
                  <td className="px-6 py-4 text-right font-display font-bold">
                    {moeda(Number(e.custo_unitario) * e.quantidade)}
                  </td>
                </tr>
              ))}
              {!entradas.isLoading && (entradas.data ?? []).length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-ink/50" colSpan={7}>
                    Nenhuma entrada registrada.
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
