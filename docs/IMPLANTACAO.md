# SAHMT unificado — versão candidata para homologação

Base: b8df3eda067f74d9f87277cea3560b179bf147ac, de 14/09/2026.
Esta versão foi preparada localmente. Não foi publicada e não deve substituir a produção antes das etapas abaixo.

## Resultado implementado

O mesmo repositório comporta a mudança; não é necessário criar outro. A página principal mantém a sessão autenticada e abre seis telas nativas: Escala, Operacional, Etiquetas, Gestão, Checklist e Treinamentos. O navegador mantém uma única página principal; as telas usam módulos JavaScript e estilos isolados. Não há iframe para hospedar outros aplicativos. O player do YouTube continua usando o iframe próprio de vídeo.

A autenticação confirmada é compartilhada em memória e revalidada quando necessário, com intervalo de cinco minutos ao solicitar acesso. Chamadas simultâneas compartilham a confirmação em andamento. Falha de rede não transforma identidade salva em autorização confirmada. Registro de acesso não bloqueia a abertura da tela.

Um único service worker controla o PWA. O cache da interface recebe identificação pelo conteúdo da versão; serviços externos e registros não são adicionados pelo novo worker. A limpeza dos caches legados se limita às entradas deste caminho. As páginas antigas, inclusive atualizar-vN e aliases de Eventos, encaminham ao app principal.

Checklist deixou de esperar mensagens do iframe. Respostas inválidas geram erro explícito; não são tratadas como relatório vazio e não liberam assinatura. Isso protege a interface, mas não corrige o serviço externo que produziu a resposta inválida observada.

Treinamentos ganhou catálogo, pontuação, retomada local por usuário, player, verificação de acompanhamento e conclusão dentro do app. A nova API mantém as planilhas e históricos existentes. A identidade para gravar vem do serviço central, não do email enviado pelo navegador. A conclusão mantém a regra de acompanhamento de 95% e término; os dados de reprodução são informados pelo cliente, não uma prova independente de presença.

Veja também `docs/REVISAO-GERAL.md`: esta revisão identificou ajuste necessário no servidor de Etiquetas.

## Dependências que bloqueiam a conclusão

1. **GitHub:** a conexão consultada permite leitura, mas não gravação neste repositório. Não houve push, PR ou publicação. É preciso habilitar acesso de escrita da conta/conexão ao repositório para continuar a implantação por aqui.
2. **Treinamentos:** o serviço publicado ainda precisa receber `apps/treinamentos/apps-script/NativeApi.gs` e o `Code.gs` ajustado. A interface nova depende dessa API. Antes de editar, exportar o projeto atualmente implantado e registrar a versão/deployment atual: o código do repositório pode divergir do implantado. Comparar ambos e preservar eventuais mudanças. O ZIP de backup do GitHub não contém esse estado externo.
3. **Checklist:** código principal, responsáveis/mensal e manifesto recebidos e incorporados ao candidato em `apps/checklist/apps-script/`. O contrato foi testado localmente. Resta comparar com o deployment real, homologar e implantar a versão 10 seguindo seu `LEIA-ME.md`. A separação da consulta e pontuação depende da instalação do gatilho; não foi ativada em produção.
4. **Etiquetas:** atualizar `apps/etiquetas/apps-script/Code.gs`, após comparar com o implantado. Agora exige validação central antes de consultas, gravações e IA; preservar propriedades e manifesto atuais.
5. **Homologação:** o navegador remoto bloqueou o endereço local da prévia. Os testes automatizados não substituem uso real em iPhone/Android nem medições após a integração.

## Autenticação central recebida

Incorporada em `auth/apps-script/`; ver seu `LEIA-ME.md`. Além dos três projetos de módulos, atualizar o projeto central após comparar com o implantado e conferir seu manifesto. Não substituir este projeto pelo servidor separado de Etiquetas.

## Sequência de implantação

- Preservar o backup original `SAHMT_Backup_2026-09-14_b8df3eda.zip` e exportar os projetos Apps Script atuais. Copiar as planilhas para homologação, sem misturar registros de teste com dados assistenciais reais.
- Conferir o backend recebido com o projeto implantado e homologar a versão 10 de Checklist com seus três arquivos e gatilho.
- Criar ambiente de homologação com domínio/caminho autorizado na autenticação, serviços de teste e planilhas copiadas. Conferir origens autorizadas do Google e permissões de execução do Apps Script. Não usar um domínio novo sem esse ajuste.
- No projeto de Treinamentos, incorporar a API nativa ao projeto existente. Manter IDs/nomes de abas e histórico. Implantar primeiro em teste e apontar a configuração de teste para o endpoint correto.
- Executar `npm ci`, `npm run build`, `npm test`. Os arquivos gerados em core/views e service-worker.js devem acompanhar as fontes no Git. Não é necessário Node no GitHub Pages.
- Testar login inicial, troca de conta, sessão revogada, falha de rede, ida/volta entre as seis telas, câmera/QR, exportações e impressão, retorno do segundo plano e preservação de rascunhos. Em cópia das planilhas: registrar/consultar etiquetas, eventos, checklist e assinatura; iniciar/retomar/concluir treinamento e repetir conclusão para verificar pontuação única. Nenhum desses registros reais foi executado durante esta preparação.
- Conferir visual em iPhone e Android: rolagem, teclado, modais, leitor QR, reprodução YouTube, orientação e impressão. Comparar tempos antes/depois na mesma rede e aparelho; não há ganho percentual medido desta versão ainda.
- Para produção, coordenar a nova versão do deployment de Treinamentos com a publicação do PWA. O doGet novo encaminha ao PWA e a interface nova exige API v1; evite intervalo com frontend antigo/backend novo. Preservar URL do deployment quando possível.
- Publicar no mesmo repositório/caminho, sem sobrescrever commits recentes. Confirmar deploy do GitHub Pages e atualização do PWA instalado. A atualização do novo worker pede que o usuário conclua os dados em edição antes de recarregar; a primeira migração a partir dos workers antigos merece teste específico.

## Retorno à versão anterior

Reverter o commit de integração ou restaurar o conteúdo de `app/` do backup original no mesmo repositório, preservando caminho e publicação. Restaurar também a versão anterior do deployment de Treinamentos; reverter só o GitHub não restaura serviços Google. Se forem feitas alterações no Checklist, registrar e restaurar seu deployment também.

A interface instalada pode continuar mostrando cache da versão nova. Após reversão, confirmar atualização do worker e recarga no aparelho; se necessário limpar somente os dados deste app no navegador, após preservar trabalhos pendentes. O retorno não desfaz gravações já feitas nas planilhas.

## Verificações realizadas

44 testes automatizados aprovados (incluindo backend e regras de responsáveis): deduplicação e falhas de autenticação, contrato defensivo do Checklist, compilação e CSS das seis telas, redirecionamentos, workers aposentados, inicialização DOM de todas as telas, isolamento e ciclo de vida, identidade verificada no Treinamentos e bloqueio de conclusão incompleta. As inicializações usam DOM e serviços simulados; as falhas de IA/metadados de Etiquetas no log são respostas simuladas de indisponibilidade. Sem teste de carga, dados reais, confirmação visual ou implantação externa.
