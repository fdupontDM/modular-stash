import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Painel de estoque" },
  { to: "/entradas", label: "Adicionar entradas" },
  { to: "/saidas", label: "Saídas & unidades" },
  { to: "/evolucao", label: "Evolução de valor" },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper font-body text-ink antialiased">
      <header className="flex items-center justify-between border-b-4 border-ink px-8 py-5">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand font-display text-xl font-bold text-brand-foreground">
            M
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none">Modular</p>
            <p className="text-xs font-medium text-ink/50">Estoque de Marketing</p>
          </div>
        </Link>
        <div className="grid size-11 place-items-center rounded-full bg-accent-warm font-display font-bold">
          MK
        </div>
      </header>

      <div className="flex">
        <aside className="min-h-[calc(100vh-85px)] w-60 shrink-0 space-y-2 border-r-4 border-ink p-5">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/40">
            Menu
          </p>
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="flex items-center gap-3 rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 font-medium text-ink"
              activeProps={{
                className:
                  "flex items-center gap-3 rounded-2xl bg-brand px-4 py-3 font-display font-semibold text-brand-foreground border-2 border-ink",
              }}
            >
              {item.label}
            </Link>
          ))}
        </aside>

        <main className="flex-1 space-y-8 p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ kicker, title }: { kicker: string; title: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.15em] text-brand">{kicker}</p>
      <h1 className="mt-1 font-display text-5xl font-bold leading-[0.95]">{title}</h1>
    </div>
  );
}
