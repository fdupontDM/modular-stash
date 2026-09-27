import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { dataBR, statusLabel, type EstoqueRow, type Entrada, type Saida } from "@/lib/estoque";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Estoque de Marketing Modular" },
      { name: "description", content: "Baixe relatórios do estoque em planilha ou PDF." },
      { property: "og:title", content: "Relatórios — Estoque de Marketing Modular" },
      { property: "og:description", content: "Relatórios de estoque, entradas, saídas e histórico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Relatorios,
});

type Secao = { nome: string; colunas: string[]; linhas: (string | number)[][] };
const opcoes = [
  { id: "estoque", label: "Estoque atual" },
  { id: "entradas", label: "Entradas" },
  { id: "saidas", label: "Saídas" },
  { id: "historico", label: "Histórico de alterações" },
] as const;
type Op = (typeof opcoes)[number]["id"];

async function carregar(ids: Op[]): Promise<Secao[]> {
  const out: Secao[] = [];
  for (const id of ids) {
    if (id === "estoque") {
      const { data, error } = await supabase.from("vw_estoque").select("*").order("codigo");
      if (error) throw error;
      out.push({
        nome: "Estoque",
        colunas: ["Código", "Descrição", "Entradas", "Saídas", "Custo médio", "Saldo", "Total comprado", "Total gasto", "Saldo restante", "Status"],
        linhas: ((data ?? []) as unknown as EstoqueRow[]).map((r) => [
          r.codigo, r.descricao, r.total_entradas, r.total_saidas, Number(r.custo_medio), r.saldo_total,
          Number(r.total_comprado), Number(r.total_gasto), Number(r.saldo_restante), statusLabel[r.status],
        ]),
      });
    } else if (id === "entradas") {
      const { data, error } = await supabase.from("entradas").select("*, materiais(codigo, descricao)").order("data", { ascending: false });
      if (error) throw error;
      out.push({
        nome: "Entradas",
        colunas: ["Data", "Código", "Descrição", "Quantidade", "Custo unitário", "Total", "Fornecedor", "Observação"],
        linhas: ((data ?? []) as unknown as Entrada[]).map((e) => [
          dataBR(e.data), e.materiais?.codigo ?? "", e.materiais?.descricao ?? "", e.quantidade,
          Number(e.custo_unitario), e.quantidade * Number(e.custo_unitario), e.fornecedor ?? "", e.observacao ?? "",
        ]),
      });
    } else if (id === "saidas") {
      const { data, error } = await supabase.from("saidas").select("*, materiais(codigo, descricao)").order("data", { ascending: false });
      if (error) throw error;
      out.push({
        nome: "Saídas",
        colunas: ["Data", "Código", "Descrição", "Quantidade", "Tipo", "Destino", "Observação"],
        linhas: ((data ?? []) as unknown as Saida[]).map((s) => [
          dataBR(s.data), s.materiais?.codigo ?? "", s.materiais?.descricao ?? "", s.quantidade,
          s.destino_tipo === "unidade" ? "Unidade" : "Pessoa", s.destino_nome, s.observacao ?? "",
        ]),
      });
    } else {
      const [{ data, error }, perfis] = await Promise.all([
        supabase.from("historico").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("perfis").select("id, nome, email"),
      ]);
      if (error) throw error;
      const acao: Record<string, string> = { INSERT: "Criou", UPDATE: "Editou", DELETE: "Excluiu" };
      const tab: Record<string, string> = { materiais: "Produto", entradas: "Entrada", saidas: "Saída" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ps = (perfis.data ?? []) as any[];
      out.push({
        nome: "Histórico",
        colunas: ["Quando", "Usuário", "Ação", "Tipo", "Detalhes"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linhas: ((data ?? []) as any[]).map((h) => {
          const p = ps.find((x) => x.id === h.user_id);
          const r = h.depois ?? h.antes ?? {};
          return [
            new Date(h.created_at).toLocaleString("pt-BR"), p ? (p.nome ?? p.email) : "Sistema",
            acao[h.acao] ?? h.acao, tab[h.tabela] ?? h.tabela,
            r.codigo ? `${r.codigo} — ${r.descricao}` : `${r.quantidade ?? ""} un.${r.destino_nome ? ` para ${r.destino_nome}` : ""}`,
          ];
        }),
      });
    }
  }
  return out;
}

const nomeArquivo = () => `relatorio-estoque-${new Date().toISOString().slice(0, 10)}`;

async function baixarPlanilha(secoes: Secao[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  secoes.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet([s.colunas, ...s.linhas]);
    ws["!cols"] = s.colunas.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, s.nome);
  });
  XLSX.writeFile(wb, `${nomeArquivo()}.xlsx`);
}

async function baixarPDF(secoes: Secao[]) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });
  const fmt = (v: string | number) =>
    typeof v === "number" && !Number.isInteger(v)
      ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(v);
  doc.setFontSize(16);
  doc.text("Relatório — Estoque de Marketing Modular", 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);
  let y = 30;
  secoes.forEach((s, i) => {
    if (i > 0) { doc.addPage(); y = 16; }
    doc.setFontSize(13);
    doc.text(s.nome, 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [s.colunas],
      body: s.linhas.map((l) => l.map(fmt)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [255, 90, 60] },
    });
  });
  doc.save(`${nomeArquivo()}.pdf`);
}

function Relatorios() {
  const [sel, setSel] = useState<Op[]>(["estoque"]);
  const [ocupado, setOcupado] = useState(false);
  const toggle = (id: Op) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const gerar = async (tipo: "xlsx" | "pdf") => {
    if (!sel.length) return toast.error("Selecione ao menos uma parte do relatório.");
    setOcupado(true);
    try {
      const secoes = await carregar(opcoes.map((o) => o.id).filter((id) => sel.includes(id)));
      await (tipo === "xlsx" ? baixarPlanilha(secoes) : baixarPDF(secoes));
      toast.success("Relatório gerado.");
    } catch {
      toast.error("Não foi possível gerar o relatório.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <AppLayout>
      <PageTitle kicker="Exportar" title="Relatórios" />
      <section className="space-y-6 rounded-3xl border-2 border-ink bg-white p-6">
        <div>
          <h2 className="font-display text-xl font-bold">O que incluir</h2>
          <p className="text-sm text-ink/50">Escolha uma ou mais partes.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {opcoes.map((o) => {
            const on = sel.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-medium ${on ? "border-ink bg-accent-warm" : "border-ink/15 bg-paper"}`}
              >
                <span className={`grid size-5 place-items-center rounded-md border-2 border-ink text-xs font-bold ${on ? "bg-ink text-paper" : ""}`}>
                  {on ? "✓" : ""}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <button disabled={ocupado} onClick={() => gerar("xlsx")} className="rounded-full border-2 border-ink bg-brand px-5 py-2.5 font-bold text-brand-foreground disabled:opacity-50">
            Baixar planilha (Excel)
          </button>
          <button disabled={ocupado} onClick={() => gerar("pdf")} className="rounded-full border-2 border-ink px-5 py-2.5 font-bold disabled:opacity-50">
            Baixar PDF
          </button>
        </div>
        <p className="text-xs text-ink/50">
          Dica: a planilha baixada pode ser aberta direto no Google Planilhas (Arquivo → Importar).
        </p>
      </section>
    </AppLayout>
  );
}
