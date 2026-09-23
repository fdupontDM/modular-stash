import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Material = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  estoque_minimo: number;
};

export type EstoqueRow = Material & {
  total_entradas: number;
  total_saidas: number;
  saldo_total: number;
  custo_medio: number;
  custo_ultima_entrada: number;
  total_comprado: number;
  total_gasto: number;
  saldo_restante: number;
  status: "em_estoque" | "baixo" | "esgotado";
};

export type Entrada = {
  id: string;
  material_id: string;
  quantidade: number;
  custo_unitario: number;
  fornecedor: string | null;
  observacao: string | null;
  data: string;
  materiais?: { codigo: string; descricao: string } | null;
};

export type Saida = {
  id: string;
  material_id: string;
  quantidade: number;
  destino_tipo: "unidade" | "pessoa";
  destino_nome: string;
  observacao: string | null;
  data: string;
  materiais?: { codigo: string; descricao: string } | null;
};

export const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const numero = (v: number) => new Intl.NumberFormat("pt-BR").format(v ?? 0);

export const dataBR = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

export const statusLabel: Record<EstoqueRow["status"], string> = {
  em_estoque: "Em estoque",
  baixo: "Baixo",
  esgotado: "Esgotado",
};

export const estoqueQuery = queryOptions({
  queryKey: ["estoque"],
  queryFn: async (): Promise<EstoqueRow[]> => {
    const { data, error } = await supabase
      .from("vw_estoque")
      .select("*")
      .order("codigo", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as EstoqueRow[];
  },
});

export const materiaisQuery = queryOptions({
  queryKey: ["materiais"],
  queryFn: async (): Promise<Material[]> => {
    const { data, error } = await supabase
      .from("materiais")
      .select("id, codigo, descricao, unidade, estoque_minimo")
      .order("codigo");
    if (error) throw error;
    return (data ?? []) as Material[];
  },
});

export const entradasQuery = queryOptions({
  queryKey: ["entradas"],
  queryFn: async (): Promise<Entrada[]> => {
    const { data, error } = await supabase
      .from("entradas")
      .select("*, materiais(codigo, descricao)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Entrada[];
  },
});

export const saidasQuery = queryOptions({
  queryKey: ["saidas"],
  queryFn: async (): Promise<Saida[]> => {
    const { data, error } = await supabase
      .from("saidas")
      .select("*, materiais(codigo, descricao)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Saida[];
  },
});
