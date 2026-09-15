# Autenticação central SAHMT — candidato baseado no código fornecido

O arquivo recebido já implementava auth, track, validação Google, dispositivos confiáveis e histórico, dentro de um projeto inicialmente chamado Etiquetas. Esta revisão separa essas responsabilidades em arquivos do MESMO projeto, mantendo compatibilidade com suas funções antigas.

Arquivos: Code.gs (entrada), Config.gs (configuração original), CentralAuth.gs (autenticação) e LegacyEtiquetas.gs (funções antigas), acompanhados de appsscript.json. Substituir o conteúdo do projeto de forma coordenada; não adicionar estes arquivos junto das mesmas definições originais, pois duplicaria constantes e funções. Não copiar o Code.gs do servidor separado de Etiquetas para este projeto: ele chama o autenticador e poderia criar chamadas circulares se implantado no endereço da autenticação.

## Preservação

Foram mantidos o Google Client ID, a lista autorizada, a planilha 1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY, as abas de dispositivos e histórico, e o contrato auth/track esperado pelo PWA. O servidor separado de Etiquetas no repositório usa outra planilha (1JBndSbftojjB-UGkBs4USUmCe5ZWdSx57bbZoSia2ME). Não houve migração de dados entre elas. O anexo não prova sozinho qual deployment executa cada versão; conferir no editor antes da implantação.

Não foi alterada a lista de usuários nem criada uma permissão universal de escrita. O autenticador verifica acesso ao SAHMT; regras de assinatura e escrita continuam nos servidores de Checklist, Eventos e Treinamentos. moduleId é contexto de registro, não uma credencial que conceda permissões.

## Ajustes

- auth valida e responde sem gravar histórico de login a cada chamada interna. O app já envia track separado. Clientes legados que só chamem auth não terão registro automático desse evento até adotarem track.
- A sessão por dispositivo verifica novamente a lista de autorizados. Status diferente de ATIVO bloqueia o dispositivo; login Google não reativa dispositivo revogado silenciosamente.
- Validação Google mantém tokeninfo e confere aud, email_verified, iss e exp. O Google recomenda biblioteca de verificação para produção; o mecanismo tokeninfo herdado ainda representa dependência externa e precisa de medição/homologação. Referência: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Último acesso é gravado no máximo a cada cinco minutos por par dispositivo/conta em chamadas sequenciais; concorrência pode gerar gravações próximas. Registro inicial usa bloqueio para evitar duplicação. Falha na atualização desse timestamp não invalida uma autenticação confirmada.
- Falha em gravar track devolve historyRecorded:false, sem negar uma sessão válida. Monitorar falhas de auditoria nas execuções do projeto; não há fila de reenvio persistente.
- Novos registros de histórico exibem somente o sufixo do token do dispositivo. Registros antigos e a tabela de dispositivos não foram migrados.
- O PWA troca a credencial Google pelo dispositivo registrado após login bem-sucedido. Não mantém o token Google para revalidá-lo em cada módulo.

## Homologação/implantação

Exportar primeiro o projeto realmente implantado, incluindo manifesto, propriedades e versão. O manifesto central foi recebido e incorporado. Preserva V8, fuso, execução como implantador e acesso ao endpoint. Foram explicitados apenas os escopos spreadsheets e script.external_request usados pelo código. O original sem oauthScopes utilizava detecção automática; isso não era, por si só, um erro. A conta que implanta deve conceder os escopos na autorização do projeto. Referência: https://developers.google.com/apps-script/concepts/scopes Manter Client ID e origem autorizada do PWA. Homologar com planilhas de teste e deployment de teste.

Publicar os quatro arquivos .gs e o manifesto no projeto que atende ao endpoint central já configurado em auth/shared-auth.js, mantendo a URL via atualização da implantação existente. Não renomear nem limpar abas. As demais APIs dependem dessa URL.

Testar login Google, restauração por dispositivo, remoção de usuário da lista, revogação de dispositivo, troca de conta, falha de rede e histórico. Validar que módulos sem direito de assinatura/gravação continuam bloqueados por suas regras próprias. 44 testes locais passaram ao incluir este projeto; não houve execução real nem medição final de latência.

## Limites preservados e retorno

Dispositivos novos continuam com a duração herdada até 9999; não foi definida uma política nova de expiração. Tokens existentes são preservados e a revogação é pelo status na planilha. O frontend reutiliza confirmação por até cinco minutos, e o Checklist mantém seu cache de autenticação de 60 segundos; não prometer revogação instantânea de telas já abertas.

Restaurar o deployment anterior e frontend anterior permite retorno. Isso não remove linhas de histórico nem dispositivos criados após a atualização. Funções de Etiquetas legadas foram preservadas, não equiparadas às funções mais recentes do outro projeto; antes de desativá-las, confirmar que nenhum cliente depende delas.
