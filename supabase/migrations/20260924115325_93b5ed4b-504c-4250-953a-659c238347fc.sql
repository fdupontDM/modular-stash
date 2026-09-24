
CREATE TYPE public.app_role AS ENUM ('admin','gerente','usuario');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  nome text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.convites (
  email text PRIMARY KEY,
  role public.app_role NOT NULL DEFAULT 'usuario',
  convidado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.convites TO authenticated;
GRANT ALL ON public.convites TO service_role;
ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  tabela text NOT NULL,
  acao text NOT NULL,
  registro_id uuid,
  antes jsonb,
  depois jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.historico TO authenticated;
GRANT ALL ON public.historico TO service_role;
ALTER TABLE public.historico ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_membro(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_gestor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','gerente'))
$$;

-- novo usuário: cria perfil e aplica convite (primeiro usuário vira admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, nome, avatar_url)
  VALUES (NEW.id, lower(NEW.email),
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
          NEW.raw_user_meta_data->>'avatar_url');
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    SELECT role INTO r FROM public.convites WHERE email = lower(NEW.email);
    IF r IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, r);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- convite criado para quem já tem conta: aplica papel
CREATE OR REPLACE FUNCTION public.aplicar_convite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  NEW.email := lower(NEW.email);
  SELECT id INTO uid FROM public.profiles WHERE email = NEW.email;
  IF uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, NEW.role);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER convites_aplicar BEFORE INSERT OR UPDATE ON public.convites
FOR EACH ROW EXECUTE FUNCTION public.aplicar_convite();

-- remover convite remove acesso
CREATE OR REPLACE FUNCTION public.remover_convite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM public.profiles WHERE email = OLD.email);
  RETURN OLD;
END $$;
CREATE TRIGGER convites_remover AFTER DELETE ON public.convites
FOR EACH ROW EXECUTE FUNCTION public.remover_convite();

-- histórico
CREATE OR REPLACE FUNCTION public.registrar_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.historico (user_id, tabela, acao, registro_id, antes, depois)
  VALUES (auth.uid(), TG_TABLE_NAME, TG_OP,
    COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER hist_materiais AFTER INSERT OR UPDATE OR DELETE ON public.materiais FOR EACH ROW EXECUTE FUNCTION public.registrar_historico();
CREATE TRIGGER hist_entradas AFTER INSERT OR UPDATE OR DELETE ON public.entradas FOR EACH ROW EXECUTE FUNCTION public.registrar_historico();
CREATE TRIGGER hist_saidas AFTER INSERT OR UPDATE OR DELETE ON public.saidas FOR EACH ROW EXECUTE FUNCTION public.registrar_historico();

-- políticas
CREATE POLICY "membros veem perfis" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_membro(auth.uid()));
CREATE POLICY "editar proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "ver papeis" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_membro(auth.uid()));
CREATE POLICY "gestores gerenciam convites" ON public.convites FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()) AND (role <> 'admin' OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "membros veem historico" ON public.historico FOR SELECT TO authenticated USING (public.is_membro(auth.uid()));

DROP POLICY "materiais abertos" ON public.materiais;
DROP POLICY "entradas abertas" ON public.entradas;
DROP POLICY "saidas abertas" ON public.saidas;
REVOKE ALL ON public.materiais, public.entradas, public.saidas FROM anon;
REVOKE ALL ON public.vw_estoque FROM anon;

CREATE POLICY "membros veem materiais" ON public.materiais FOR SELECT TO authenticated USING (public.is_membro(auth.uid()));
CREATE POLICY "membros criam materiais" ON public.materiais FOR INSERT TO authenticated WITH CHECK (public.is_membro(auth.uid()));
CREATE POLICY "gestores editam materiais" ON public.materiais FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "gestores excluem materiais" ON public.materiais FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));

CREATE POLICY "membros veem entradas" ON public.entradas FOR SELECT TO authenticated USING (public.is_membro(auth.uid()));
CREATE POLICY "membros criam entradas" ON public.entradas FOR INSERT TO authenticated WITH CHECK (public.is_membro(auth.uid()));
CREATE POLICY "gestores excluem entradas" ON public.entradas FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));

CREATE POLICY "membros veem saidas" ON public.saidas FOR SELECT TO authenticated USING (public.is_membro(auth.uid()));
CREATE POLICY "membros criam saidas" ON public.saidas FOR INSERT TO authenticated WITH CHECK (public.is_membro(auth.uid()));
CREATE POLICY "gestores excluem saidas" ON public.saidas FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));
