# Onda 03 — correções MOV · v2026.10.10-wave03.1

Relacionado: #3463 (Onda 03), PR #3450. Base validada: c5bebbf19037d58dc704d8380cd77768d5678d87.

Suite original: 88 testes, 83 passaram e 5 falharam. Corrigidos dois defeitos: fórmula de área de polígono usava coordenada do vértice errado; escape CSV descartava o primeiro caractere. CSV agora preserva o texto, prefixa apóstrofo e cobre espaços/controles antes de fórmulas. Três expectativas corrigidas por cálculo independente: 4 m de perfil de 200 mm² a 7850 kg/m³ pesam 6,28 kg; porta tem lengthMm 2396; objeto rotacionado de 500 mm só cabe em x <=3500 numa sala de 4000 mm.

Validação local: 26 arquivos/97 testes passaram. Typecheck estrito dos módulos puros passou antes das correções; repetir no SHA novo. Não é build completo do frontend, homologação de UX, persistência ou produção.

Bloqueios: PR #3450 tem conflito com main; acesso Git do terminal sem autenticação; execução remota Contabo indisponível por cota mensal do Desktop Commander. Não publicar antes do build completo e homologação. MED-02 tem núcleo checkAsBuilt, mas integração/fotos/preprojeto ainda não comprovados. CNC industrial e nesting otimizado não implementados por estas correções.
