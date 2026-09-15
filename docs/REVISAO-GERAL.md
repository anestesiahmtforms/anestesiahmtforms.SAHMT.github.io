# Segunda revisão do app e serviços

## Conclusão

Não basta atualizar o Checklist. Existem três projetos Apps Script com alterações necessárias neste candidato: Checklist, Treinamentos e Etiquetas. A publicação permanece pendente.

| Componente | Resultado |
|---|---|
| Checklist | Fonte recebida em conversa + manifesto incorporados; regra da primeira posição disponível; consulta desacoplada da pontuação após instalar gatilho. Atualizar Code.gs, arquivo de responsáveis e manifesto no projeto correto. |
| Treinamentos | Frontend nativo precisa da API nova. Atualizar Code.gs e adicionar NativeApi.gs no projeto existente; conferir permissão de chamadas externas no manifesto e manter a planilha/histórico. |
| Etiquetas | Nesta revisão foi corrigida a ausência de validação no servidor: e-mail informado pelo cliente não é identidade suficiente. Atualizar Code.gs após comparar com o projeto realmente implantado. |
| Eventos/Operacional | O fonte disponível já valida identidade e autorização para gravações. Não foi identificada mudança obrigatória no Apps Script para a unificação. Isso não é certificação de toda a segurança: os destaques e fontes de leitura atuais continuam com seu modelo de acesso original. |
| Escala/Gestão | Mudanças estão no frontend compartilhado; não foi identificado Apps Script adicional a alterar exclusivamente por esta navegação. |
| Autenticação central | shared-auth.js do navegador foi ajustado. O código do servidor central não está disponível; contrato foi simulado em testes, não foi feita auditoria do servidor nem provada sua compatibilidade real com os três projetos candidatos. |

## Verificação feita

Releitura das integrações e contratos de sessão; reconstrução dos seis módulos; 36 testes locais passaram. Foram acrescentados testes de rejeição de consulta/IA anônimas, rejeição de sessão negada e autoria verificada nas edições de Etiquetas. A compilação dos fontes não substitui teste visual nem de serviços reais.

Etiquetas agora consulta o autenticador em cada requisição, uma vez por requisição, como proteção do servidor. Sessão única na interface não dispensa validação nas APIs. Medir latência real antes de otimizar; não retirar validação para ganhar velocidade.

## Limites e próximos passos concretos

- Exportar e comparar os projetos atualmente implantados de Treinamentos e Etiquetas com os fontes do GitHub, para não sobrepor mudanças externas. Obter o código do autenticador central para conferir contrato, expiração/revogação e permissões por módulo.
- Instalar serviços e gatilho em homologação com planilhas de teste. Verificar acesso do Checklist à planilha de Eventos e identificação por nome/sigla em registros reais de teste.
- Testar troca de conta, rascunhos, câmera/QR, teclado/modal no smartphone, reprodução e conclusão de vídeo, PDFs e impressão. O navegador remoto não conseguiu abrir a prévia local; não houve validação visual desta arquitetura nativa.
- O navegador terá uma única sessão, mas as APIs externas ainda fazem chamadas próprias, leituras de Sheets e validações. Não há medição real do ganho de velocidade nesta versão.
- Habilitar escrita no GitHub e coordenar os deployments Apps Script e PWA. Não publicar apenas o frontend: Treinamentos exige a API nova.

O pacote é candidato para homologação, não uma declaração de que tudo está aprovado para produção.

## Atualização após recebimento da autenticação

O código do autenticador foi fornecido e revisado. Ele já atendia auth/track, mas estava misturado a funções antigas de Etiquetas. A versão candidata está em auth/apps-script, separada em quatro arquivos com compatibilidade. Ver o LEIA-ME desse projeto: o manifesto central foi recebido e incorporado com escopos explícitos; a implantação real não foi comparada/testada.

Agora há quatro projetos a coordenar: autenticação central, Checklist, Treinamentos e servidor separado de Etiquetas. A planilha no projeto central é diferente da planilha de Etiquetas do repositório; nenhuma delas foi substituída. Os 44 testes locais passaram.
