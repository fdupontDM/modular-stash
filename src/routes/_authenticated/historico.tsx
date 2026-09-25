import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { perfisQuery } from "@/lib/usuarios";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de alterações — Estoque de Marketing Modular" },
      { name: "description", content: "Quem criou, editou ou excluiu cada item do estoque." },
      { property: "og:title", content: "Histórico de alterações — Estoque de Marketing Modular" },
      { property: "og:description", content: "Registro de todas as alterações por usuário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Historico,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = { [k: string]: any } & { codigo?: any; descricao?: any; quantidade?: any; custo_unitario?: any; fornecedor?: any; destino_nome?: any; material_id?: any };
type Linha = {
  id: string;
  user_id: string | null;
  tabela: string;
  acao: string;
  antes: Rec | null;
  depois: Rec | null;
  created_at: string;
};

const acaoLabel: Record<string, string> = { INSERT: "Criou", UPDATE: "Editou", DELETE: "Excluiu" };
const acaoCor: Record<string, string> = {
  INSERT: "bg-mint/15 text-mint",
  UPDATE: "bg-accent-warm/40 text-ink",
  DELETE: "bg-brand/15 text-brand",
};
const tabelaLabel: Record<string, string> = { materiais: "Produto", entradas: "Entrada", saidas: "Saída" };
const campoLabel: Record<string, string> = {
  codigo: "Código",
  descricao: "Descrição",
  unidade: "Unidade",
  estoque_minimo: "Estoque mínimo",
  quantidade: "Quantidade",
  custo_unitario: "Custo unitário",
  fornecedor: "Fornecedor",
  destino_nome: "Destino",
  destino_tipo: "Tipo de destino",
  observacao: "Observação",
  data: "Data",
};

function resumo(l: Linha) {
  if (l.acao === "UPDATE" && l.antes && l.depois) {
    return Object.keys(campoLabel)
      .filter((k) => JSON.stringify(l.antes![k]) !== JSON.stringify(l.depois![k]))
      .map((k) => `${campoLabel[k]}: ${String(l.antes![k] ?? "—")} → ${String(l.depois![k] ?? "—")}`)
      .join(" · ");
  }
  const r = l.depois ?? l.antes ?? {};
  if (l.tabela === "materiais") return `${r.codigo} — ${r.descricao}`;
  if (l.tabela === "entradas") return `${r.quantidade} un. a R$ ${r.custo_unitario}${r.fornecedor ? ` (${r.fornecedor})` : ""}`;
  return `${r.quantidade} un. para ${r.destino_nome}`;
}

function Historico() {
  const [filtroUser, setFiltroUser] = useState("");
  const perfis = useQuery(perfisQuery);
  const materiais = useQuery({
    queryKey: ["materiais-nomes"],
    queryFn: async () => (await supabase.from("materiais").select("id, codigo, descricao")).data ?? [],
  });
  const hist = useQuery({
    queryKey: ["historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const nomeUser = (id: string | null) => {
    const p = perfis.data?.find((x) => x.id === id);
    return p ? (p.nome ?? p.email) : "Sistema";
  };
  const produto = (l: Linha) => {
    if (l.tabela === "materiais") return null;
    const mid = (l.depois ?? l.antes)?.material_id;
    const m = materiais.data?.find((x) => x.id === mid);
    return m ? `${m.codigo} ${m.descricao}` : null;
  };

  const linhas = (hist.data ?? []).filter((l) => !filtroUser || l.user_id === filtroUser);

  return (
    <AppLayout>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle kicker="Auditoria" title="Histórico de alterações" />
        <select
          value={filtroUser}
          onChange={(e) => setFiltroUser(e.target.value)}
          className="rounded-full border-2 border-ink bg-white px-4 py-2 text-sm"
        >
          <option value="">Todos os usuários</option>
          {(perfis.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome ?? p.email}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-3xl border-2 border-ink bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink/10 text-left text-[11px] uppercase tracking-wider text-ink/40">
              <th className="px-6 py-3">Quando</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-6 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {hist.isLoading && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-ink/50">Carregando…</td>
              </tr>
            )}
            {!hist.isLoading && linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-ink/50">Nenhuma alteração registrada.</td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-ink/5 align-top">
                <td className="whitespace-nowrap px-6 py-4 text-ink/60">
                  {new Date(l.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-4 font-medium">{nomeUser(l.user_id)}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${acaoCor[l.acao]}`}>
                    {acaoLabel[l.acao]} {tabelaLabel[l.tabela]?.toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-4">{produto(l) ?? "—"}</td>
                <td className="px-6 py-4 text-ink/70">{resumo(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppLayout>
  );
}
