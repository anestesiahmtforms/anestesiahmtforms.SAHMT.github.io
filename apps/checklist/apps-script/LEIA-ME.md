# Checklist v10 — candidato para homologação

Arquivos do mesmo projeto: Code.gs, Responsaveis.gs e appsscript.json. O nome Responsaveis.gs foi atribuído aqui; substitua o conteúdo do arquivo correspondente existente, sem duplicar suas constantes/funções. O trecho enviado terminava sem a chave final de selectResponsible_; ela foi acrescentada. As regras fornecidas de escala, férias, eventos, manutenção e assinatura permanecem.

## Instalação coordenada

1. Antes de editar, exportar o projeto atual e registrar versão do deployment, propriedades e gatilhos. Os originais enviados estão em reference/checklist no pacote completo, mas não são um backup verificado da versão implantada.
2. Homologar com cópias das planilhas e serviços configurados para teste. Conferir SPREADSHEET_ID, TRAINING_SPREADSHEET_ID, fontes de escala e RESPONSIBLE_EMAILS_JSON. Propriedades não estão incluídas no manifesto.
3. Aplicar os três arquivos ao projeto correto e publicar uma versão do deployment, preservando a URL já usada pelo PWA. O manifesto mantém execução como usuário que implanta; os endpoints autenticam pelo serviço central antes de operar. Não remover authenticate_.
4. Executar installChecklistScoreTrigger uma vez, pela conta proprietária da automação, e concluir as autorizações. Ela cria o fechamento diário no fuso America/Sao_Paulo e só então ativa CHECKLIST_SCHEDULED_SCORE=1. Conferir gatilhos existentes também nas outras contas, pois o Apps Script lista os gatilhos do usuário atual.
5. Verificar assinatura/pontuação com dados de teste e acompanhar a primeira execução diária. O horário é a janela do gatilho do Apps Script, não garantia de execução exatamente à meia-noite.

## Comportamento

Antes da ativação, consultas mantêm a recuperação de pontuação legada. Depois dela, consultar relatório não espera o bloqueio de gravação da pontuação. A assinatura ainda sincroniza pontos e o gatilho fecha o dia anterior. Consultas antigas deixam de recalcular pontos automaticamente nesse modo.

Os gatilhos não garantem execução se houver falha/quota/indisponibilidade. O código herdado registra falhas de pontuação no log; monitorar o fechamento. Para recuperar dias pendentes com o mecanismo legado, definir CHECKLIST_SCHEDULED_SCORE=0 e consultar os dias afetados de forma controlada; isso pode gravar pontuação. Reativar somente após verificar a recuperação. Não executar recuperação em produção como simples teste de leitura.

A consulta ainda depende da leitura de planilhas e, quando o cache de responsáveis expira, de nove fontes externas e da planilha de registros de eventos. Não há promessa de abertura instantânea nem ganho cronometrado após esta alteração.

## Retorno

Definir CHECKLIST_SCHEDULED_SCORE=0 restaura a sincronização durante consultas nesta versão. Para retorno completo, restaurar o deployment/código anterior e sua configuração de gatilhos. O rollback não desfaz pontos nem assinaturas já gravados.


## Responsável: regra solicitada da posição 1

Seleciona a primeira posição disponível na mesma ordem de siglas do bloco de Eventos de Escala (1, 2, 3...). Desconta férias e eventos registrados com substituto preenchido. Atrasos e lançamentos de suporte sem membro ausente não retiram uma posição. Marcações visuais genéricas não comprovam substituição. Em grupos de siglas, conserva a primeira pessoa disponível do grupo.

A conta que implanta o Apps Script precisa ter leitura da planilha de Eventos 1ku56cds3LvaFuRHaNGysw-VI2jSq8l1Q6CFOsHmoCXg, aba Registros. A lista de contatos identifica nomes completos; evento com substituto e membro não identificado impede apontar um responsável até corrigir o cadastro. O cache de fontes dura até cinco minutos.

A seleção é usada nos relatórios diário e mensal e na atribuição futura de pontos. Assinaturas e pontos arquivados não são reescritos pela implantação. A exibição do responsável em consultas históricas passa a usar a nova regra calculada; não foi criada migração retroativa de pontuação. Recuperações históricas manuais merecem revisão antes de executar.
