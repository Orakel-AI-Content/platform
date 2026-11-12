-- Migração de dados: a 0022 (#668) deu `pipeline_state = 'disponivel'` a todas as releases
-- antigas, inclusive às que a conferência já tinha marcado com a imagem `ausente` no host. Elas
-- apareciam como prontas, podiam ser fixadas num site e o build falhava no pull. Vão a `falhou`,
-- o estado em que o fluxo atual deixa um download que falha, e "Tentar de novo" volta a
-- `baixando` (imageStatus `ausente`) e reenfileira a conferência da imagem. Só pega a combinação
-- inconsistente, então rodar de novo não acha nada.
UPDATE "releases"
SET "pipeline_state" = 'falhou',
    "failure_reason" = 'A imagem não estava no host na última conferência (estado de antes do pipeline da release): tente de novo para baixá-la'
WHERE "pipeline_state" = 'disponivel' AND "image_status" = 'ausente';
