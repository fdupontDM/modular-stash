import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAcesso } from "@/lib/usuarios";

const nav = [
  { to: "/", label: "Painel de estoque", gestor: false },
  { to: "/entradas", label: "Adicionar entradas", gestor: false },
  { to: "/saidas", label: "Saídas & unidades", gestor: false },
  { to: "/evolucao", label: "Evolução de valor", gestor: false },
  { to: "/historico", label: "Histórico", gestor: false },
  { to: "/usuarios", label: "Usuários", gestor: true },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const acesso = useAcesso();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const sair = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const nome =
    (acesso.data?.user.user_metadata?.["full_name"] as string | undefined) ??
    acesso.data?.user.email ??
    "";
  const iniciais = nome
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  if (acesso.isLoading) {
    return <div className="grid min-h-screen place-items-center bg-paper text-ink/50">Carregando…</div>;
  }

  if (!acesso.data?.membro) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6 font-body text-ink">
        <div className="max-w-sm rounded-3xl border-2 border-ink bg-white p-8 text-center">
          <h1 className="font-display text-2xl font-bold">Acesso não liberado</h1>
          <p className="mt-2 text-sm text-ink/60">
            {acesso.data?.user.email} ainda não foi convidado. Peça a um admin ou gerente para
            adicionar seu e-mail.
          </p>
          <button
            onClick={sair}
            className="mt-6 rounded-full border-2 border-ink px-5 py-2 font-semibold"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper font-body text-ink antialiased">
      <header className="flex items-center justify-between gap-3 border-b-4 border-ink px-4 py-4 md:px-8 md:py-5">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand font-display text-xl font-bold text-brand-foreground">
            M
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none">Modular</p>
            <p className="text-xs font-medium text-ink/50">Estoque de Marketing</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="min-w-0 text-right">
            <p className="hidden max-w-48 truncate text-sm font-semibold sm:block">{nome}</p>
            <button onClick={sair} className="text-xs font-medium text-brand">
              Sair
            </button>
          </div>
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-warm font-display font-bold">
            {iniciais}
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row">
        <aside className="flex gap-2 overflow-x-auto border-b-4 border-ink p-3 md:min-h-[calc(100vh-85px)] md:w-60 md:shrink-0 md:flex-col md:space-y-0 md:border-b-0 md:border-r-4 md:p-5">
          <p className="mb-2 hidden px-3 text-[11px] md:block font-semibold uppercase tracking-[0.2em] text-ink/40">
            Menu
          </p>
          {nav
            .filter((i) => !i.gestor || acesso.data?.gestor)
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl border-2 border-ink/10 bg-white px-4 py-2.5 md:py-3 font-medium text-ink"
                activeProps={{
                  className:
                    "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl bg-brand px-4 py-2.5 md:py-3 font-display font-semibold text-brand-foreground border-2 border-ink",
                }}
              >
                {item.label}
              </Link>
            ))}
        </aside>

        <main className="min-w-0 flex-1 space-y-6 p-4 md:space-y-8 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ kicker, title }: { kicker: string; title: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.15em] text-brand">{kicker}</p>
      <h1 className="mt-1 font-display text-3xl md:text-5xl font-bold leading-[0.95]">{title}</h1>
    </div>
  );
}
