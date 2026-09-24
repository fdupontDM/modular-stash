import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Papel = "admin" | "gerente" | "usuario";
export const papelLabel: Record<Papel, string> = {
  admin: "Admin",
  gerente: "Gerente",
  usuario: "Comum",
};

export const meuAcessoQuery = queryOptions({
  queryKey: ["meu-acesso"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const roles = (data ?? []).map((r) => r.role as Papel);
    return {
      user: u.user,
      roles,
      membro: roles.length > 0,
      gestor: roles.includes("admin") || roles.includes("gerente"),
      admin: roles.includes("admin"),
    };
  },
});

export function useAcesso() {
  return useQuery(meuAcessoQuery);
}

export type Perfil = { id: string; email: string; nome: string | null };

export const perfisQuery = queryOptions({
  queryKey: ["perfis"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id, email, nome");
    if (error) throw error;
    return (data ?? []) as Perfil[];
  },
});
