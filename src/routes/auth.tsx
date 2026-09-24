import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Estoque de Marketing Modular" },
      { name: "description", content: "Acesso ao sistema de estoque de marketing da Modular." },
      { property: "og:title", content: "Entrar — Estoque de Marketing Modular" },
      { property: "og:description", content: "Acesso restrito à equipe convidada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const entrar = async () => {
    setLoading(true);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (r.error) {
      toast.error("Não foi possível entrar com o Google.");
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-paper p-6 font-body text-ink">
      <div className="w-full max-w-sm rounded-3xl border-2 border-ink bg-white p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand font-display text-2xl font-bold text-brand-foreground">
          M
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold">Estoque de Marketing</h1>
        <p className="mt-2 text-sm text-ink/60">Acesso apenas para pessoas convidadas.</p>
        <button
          onClick={entrar}
          disabled={loading}
          className="mt-6 w-full rounded-full border-2 border-ink bg-brand px-5 py-3 font-display font-bold text-brand-foreground disabled:opacity-60"
        >
          {loading ? "Abrindo…" : "Entrar com Google"}
        </button>
      </div>
    </div>
  );
}
