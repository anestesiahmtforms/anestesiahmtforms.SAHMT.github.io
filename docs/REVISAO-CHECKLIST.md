# Revisão do backend de Checklist recebido

Fonte preservada integralmente em reference/checklist/Code.recebido.gs. É referência parcial, não um backend completo pronto para implantação.

## Achados confirmados no código e nos testes

- O backend valida a identidade no serviço central e armazena a confirmação por 60 segundos. A unificação do frontend pode compartilhar a sessão, mas não deve retirar essa validação do servidor.
- report_ retorna items, day, revision, canSign e signature, compatíveis com o contrato da tela nativa quando as dependências estão presentes.
- doGet retorna somente identificação/saúde do serviço, com ok:true e sem items. Essa resposta reproduz a incompatibilidade que causaria erro ao iterar items. Ainda não foi demonstrado que o navegador recebeu especificamente essa resposta no incidente original; é uma hipótese a verificar pela rede em homologação.
- doPost de report chama syncChecklistScore_ antes de retornar, inclusive para consultar o dia anterior ao abrir o relatório atual. Essa função pode aguardar até 25 segundos por um ScriptLock e acessar outra planilha. Isso é um caminho de latência confirmado no código, não uma medição do tempo efetivo de produção.
- A consulta de relatório tem efeitos de gravação na pontuação. Não disparar consultas reais como se fossem operações estritamente de leitura durante a homologação; utilizar cópias de planilhas.
- O arquivo usa INACTIVE_UNIT_IDS, monthly_ e responsibleForDay_, mas não define esses símbolos. Podem existir em outros arquivos do mesmo projeto. Sua ausência no envio não prova ausência na implantação.

## Próxima alteração a preparar após receber o restante

Separar a consulta do relatório da atualização de pontuação, preservando a atualização após assinatura e a rotina diária de fechamento. Antes de retirar chamadas, verificar o arquivo de responsáveis, o relatório mensal e a instalação real do gatilho; não perder recuperação de pontuação antiga nem mudar regras de penalidade.

Necessário receber os demais arquivos do projeto, especialmente aqueles que definem os três símbolos acima. Não foi implantada alteração no Apps Script nem alterada planilha.

## Testes

24 testes locais aprovados ao todo, quatro novos para o backend recebido: incompatibilidade do health com relatório, dependências ausentes, compatibilidade do relatório com dependências simuladas e chamada da sincronização de pontos ao consultar. Serviços Google simulados; sem autenticação ou gravação real.

## Complemento recebido e incorporado

Recebidos posteriormente o código de responsáveis/relatório mensal e o manifesto. As três dependências identificadas acima agora estão definidas no candidato em apps/checklist/apps-script. O trecho de responsáveis precisava apenas da chave final de fechamento, adicionada à cópia normalizada. Os achados anteriores descrevem o primeiro arquivo isolado, não o conjunto atual.

A versão 9 prepara a separação entre leitura e pontuação por meio da propriedade CHECKLIST_SCHEDULED_SCORE. A função de instalação só habilita essa separação após criar o gatilho diário; a sincronização após assinatura permanece. Ver instruções detalhadas em apps/checklist/apps-script/LEIA-ME.md. Não foi executada a instalação nem publicado deployment. Metadados consultados pela integração Drive identificam a planilha padrão como “SAHMT-BH — Checklist do Arsenal”; não foram lidas linhas nem alterados dados.

30 testes locais aprovados ao todo. Os testes novos verificam terceira sigla disponível, férias/eventos, falta de responsáveis, calendário mensal, permissão de assinatura, preservação de pontuação ao assinar e ativação condicionada ao sucesso da instalação do gatilho.

## Mudança solicitada: posição 1

A versão 10 seleciona a primeira posição disponível do bloco de siglas em Eventos de Escala, avançando em ordem crescente por férias ou evento com substituto preenchido. A fonte de eventos passa a ser a aba Registros; destaques genéricos não são usados como prova de substituição. A regra anterior de terceira posição está substituída no candidato. 33 testes locais passaram. Nenhuma alteração publicada.
