import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout, PageTitle } from "@/components/AppLayout";
import { papelLabel, perfisQuery, useAcesso, type Papel } from "@/lib/usuarios";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Estoque de Marketing Modular" },
      { name: "description", content: "Convide pessoas e defina o nível de acesso ao estoque." },
      { property: "og:title", content: "Usuários — Estoque de Marketing Modular" },
      { property: "og:description", content: "Gestão de usuários e permissões." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Usuarios,
});

const inputCls =
  "rounded-2xl border-2 border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink";

function Usuarios() {
  const qc = useQueryClient();
  const acesso = useAcesso();
  const perfis = useQuery(perfisQuery);
  const convites = useQuery({
    queryKey: ["convites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("convites").select("*").order("email");
      if (error) throw error;
      return data;
    },
  });
  const papeis = useQuery({
    queryKey: ["papeis"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id, role");
      return data ?? [];
    },
  });

  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("usuario");

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["convites"] });
    qc.invalidateQueries({ queryKey: ["papeis"] });
  };

  const salvar = useMutation({
    mutationFn: async (v: { email: string; role: Papel }) => {
      const { error } = await supabase
        .from("convites")
        .upsert({ email: v.email.trim().toLowerCase(), role: v.role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso salvo.");
      setEmail("");
      invalidar();
    },
    onError: () => toast.error("Não foi possível salvar. Verifique suas permissões."),
  });

  const remover = useMutation({
    mutationFn: async (e: string) => {
      const { error } = await supabase.from("convites").delete().eq("email", e);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso removido.");
      invalidar();
    },
  });

  if (!acesso.data?.gestor) {
    return (
      <AppLayout>
        <p className="text-ink/60">Apenas admins e gerentes podem gerenciar usuários.</p>
      </AppLayout>
    );
  }

  const opcoes: Papel[] = acesso.data.admin ? ["usuario", "gerente", "admin"] : ["usuario", "gerente"];
  const papelDe = (mail: string) => {
    const p = perfis.data?.find((x) => x.email === mail);
    return p ? papeis.data?.find((r) => r.user_id === p.id)?.role : undefined;
  };

  // membros sem convite (ex.: primeiro admin)
  const semConvite = (perfis.data ?? []).filter(
    (p) => !convites.data?.some((c) => c.email === p.email) && papeis.data?.some((r) => r.user_id === p.id),
  );

  return (
    <AppLayout>
      <PageTitle kicker="Equipe" title="Usuários" />

      <section className="rounded-3xl border-2 border-ink bg-white p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Convidar pessoa</h2>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.includes("@")) { toast.error("Informe um e-mail válido."); return; }
            salvar.mutate({ email, role: papel });
          }}
        >
          <input
            className={`${inputCls} w-full min-w-0 flex-1 sm:min-w-64`}
            placeholder="email@modular.com.br (conta Google)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className={inputCls} value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            {opcoes.map((o) => (
              <option key={o} value={o}>
                {papelLabel[o]}
              </option>
            ))}
          </select>
          <button className="rounded-full border-2 border-ink bg-brand px-6 py-2.5 font-display font-bold text-brand-foreground">
            Convidar
          </button>
        </form>
        <p className="mt-3 text-xs text-ink/50">
          Comum: registra entradas e saídas. Gerente e Admin: também editam/excluem produtos e
          gerenciam usuários.
        </p>
      </section>

      <section className="overflow-hidden rounded-3xl border-2 border-ink bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b-2 border-ink/10 text-left text-[11px] uppercase tracking-wider text-ink/40">
              <th className="px-6 py-3">E-mail</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {semConvite.map((p) => (
              <tr key={p.id} className="border-b border-ink/5">
                <td className="px-6 py-4 font-medium">{p.email}</td>
                <td className="px-4 py-4">{p.nome}</td>
                <td className="px-4 py-4 text-mint">Ativo</td>
                <td className="px-4 py-4">
                  {papelLabel[papeis.data?.find((r) => r.user_id === p.id)?.role as Papel]}
                </td>
                <td className="px-6 py-4 text-xs text-ink/40">Criador</td>
              </tr>
            ))}
            {(convites.data ?? []).map((c) => {
              const perfil = perfis.data?.find((p) => p.email === c.email);
              const bloqueado = c.role === "admin" && !acesso.data?.admin;
              return (
                <tr key={c.email} className="border-b border-ink/5">
                  <td className="px-6 py-4 font-medium">{c.email}</td>
                  <td className="px-4 py-4">{perfil?.nome ?? "—"}</td>
                  <td className="px-4 py-4">
                    {perfil && papelDe(c.email) ? (
                      <span className="text-mint">Ativo</span>
                    ) : (
                      <span className="text-ink/50">Aguardando 1º acesso</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      disabled={bloqueado || perfil?.id === acesso.data?.user.id}
                      className="rounded-xl border-2 border-ink/15 px-2 py-1"
                      value={c.role}
                      onChange={(e) => salvar.mutate({ email: c.email, role: e.target.value as Papel })}
                    >
                      {(bloqueado ? (["admin"] as Papel[]) : opcoes).map((o) => (
                        <option key={o} value={o}>
                          {papelLabel[o]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!bloqueado && perfil?.id !== acesso.data?.user.id && (
                      <button
                        onClick={() => confirm(`Remover acesso de ${c.email}?`) && remover.mutate(c.email)}
                        className="text-xs font-semibold text-brand"
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </section>
    </AppLayout>
  );
}
