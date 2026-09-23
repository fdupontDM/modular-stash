CREATE TABLE public.materiais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  estoque_minimo integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.entradas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  custo_unitario numeric(12,2) NOT NULL CHECK (custo_unitario >= 0),
  fornecedor text,
  observacao text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.saidas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  destino_tipo text NOT NULL DEFAULT 'unidade' CHECK (destino_tipo IN ('unidade','pessoa')),
  destino_nome text NOT NULL,
  observacao text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_entradas_material ON public.entradas(material_id);
CREATE INDEX idx_saidas_material ON public.saidas(material_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entradas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saidas TO anon, authenticated;
GRANT ALL ON public.materiais TO service_role;
GRANT ALL ON public.entradas TO service_role;
GRANT ALL ON public.saidas TO service_role;

ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materiais abertos" ON public.materiais FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "entradas abertas" ON public.entradas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "saidas abertas" ON public.saidas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE VIEW public.vw_estoque
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.codigo,
  m.descricao,
  m.unidade,
  m.estoque_minimo,
  COALESCE(e.total_entradas, 0)::int AS total_entradas,
  COALESCE(s.total_saidas, 0)::int AS total_saidas,
  (COALESCE(e.total_entradas, 0) - COALESCE(s.total_saidas, 0))::int AS saldo_total,
  COALESCE(e.custo_medio, 0)::numeric(12,2) AS custo_medio,
  COALESCE(e.ultimo_custo, 0)::numeric(12,2) AS custo_ultima_entrada,
  COALESCE(e.total_comprado, 0)::numeric(12,2) AS total_comprado,
  (COALESCE(s.total_saidas, 0) * COALESCE(e.custo_medio, 0))::numeric(12,2) AS total_gasto,
  ((COALESCE(e.total_entradas, 0) - COALESCE(s.total_saidas, 0)) * COALESCE(e.custo_medio, 0))::numeric(12,2) AS saldo_restante,
  CASE
    WHEN (COALESCE(e.total_entradas, 0) - COALESCE(s.total_saidas, 0)) <= 0 THEN 'esgotado'
    WHEN (COALESCE(e.total_entradas, 0) - COALESCE(s.total_saidas, 0)) <= m.estoque_minimo THEN 'baixo'
    ELSE 'em_estoque'
  END AS status
FROM public.materiais m
LEFT JOIN (
  SELECT material_id,
         SUM(quantidade) AS total_entradas,
         SUM(quantidade * custo_unitario) AS total_comprado,
         CASE WHEN SUM(quantidade) > 0 THEN SUM(quantidade * custo_unitario) / SUM(quantidade) ELSE 0 END AS custo_medio,
         (ARRAY_AGG(custo_unitario ORDER BY data DESC, created_at DESC))[1] AS ultimo_custo
  FROM public.entradas GROUP BY material_id
) e ON e.material_id = m.id
LEFT JOIN (
  SELECT material_id, SUM(quantidade) AS total_saidas
  FROM public.saidas GROUP BY material_id
) s ON s.material_id = m.id;

GRANT SELECT ON public.vw_estoque TO anon, authenticated, service_role;

INSERT INTO public.materiais (id, codigo, descricao, unidade, estoque_minimo) VALUES
  ('11111111-1111-1111-1111-111111111101', 'MK-001', 'Camiseta promocional', 'un', 20),
  ('11111111-1111-1111-1111-111111111102', 'MK-014', 'Caneca de cerâmica', 'un', 10),
  ('11111111-1111-1111-1111-111111111103', 'MK-027', 'Brinde garrafa térmica', 'un', 10),
  ('11111111-1111-1111-1111-111111111104', 'MK-033', 'Adesivo vinil A4', 'un', 50);

INSERT INTO public.entradas (material_id, quantidade, custo_unitario, fornecedor, data) VALUES
  ('11111111-1111-1111-1111-111111111101', 60, 30.00, 'Brindes Brasil', CURRENT_DATE - 150),
  ('11111111-1111-1111-1111-111111111101', 60, 34.00, 'Brindes Brasil', CURRENT_DATE - 40),
  ('11111111-1111-1111-1111-111111111102', 80, 18.50, 'Cerâmica Sul', CURRENT_DATE - 120),
  ('11111111-1111-1111-1111-111111111103', 30, 42.00, 'Térmicos SA', CURRENT_DATE - 100),
  ('11111111-1111-1111-1111-111111111103', 30, 48.00, 'Térmicos SA', CURRENT_DATE - 20),
  ('11111111-1111-1111-1111-111111111104', 500, 4.20, 'Grafica Modular', CURRENT_DATE - 60);

INSERT INTO public.saidas (material_id, quantidade, destino_tipo, destino_nome, data) VALUES
  ('11111111-1111-1111-1111-111111111101', 45, 'unidade', 'Filial Norte', CURRENT_DATE - 30),
  ('11111111-1111-1111-1111-111111111101', 40, 'unidade', 'Matriz', CURRENT_DATE - 10),
  ('11111111-1111-1111-1111-111111111102', 78, 'pessoa', 'Ana Souza', CURRENT_DATE - 25),
  ('11111111-1111-1111-1111-111111111103', 60, 'unidade', 'Filial Sul', CURRENT_DATE - 15),
  ('11111111-1111-1111-1111-111111111104', 210, 'unidade', 'Matriz', CURRENT_DATE - 5);