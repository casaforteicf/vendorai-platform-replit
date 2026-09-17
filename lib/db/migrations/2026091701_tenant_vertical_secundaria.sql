-- Campo opcional de vertical secundária. Generaliza o padrão que já
-- existia só pro Pet Shop (escrito na mão: vertical "Varejo" ganhando
-- também as telas de "Salão") para qualquer combinação de duas
-- verticais, sem precisar de exceção nova no código a cada caso.
-- Nulo por padrão -- a esmagadora maioria dos tenants continua com uma
-- única vertical, sem nenhuma mudança de comportamento.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS vertical_secundaria TEXT;
