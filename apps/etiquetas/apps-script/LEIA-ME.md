# Etiquetas — validação central de identidade

O Code.gs do repositório aceitava userEmail enviado pelo navegador como autor, não validava consultas e permitia chamadas de IA sem confirmar sessão. A versão candidata valida authToken/deviceToken no serviço central antes de consultar registros, chamar IA ou preparar gravações. O autor vem da resposta do serviço central. Cada requisição valida uma vez; falhas bloqueiam a operação.

Antes de substituir o projeto, exportar o código atualmente implantado e comparar com este arquivo. Preservar propriedades (incluindo OPENAI_API_KEY), planilha, permissões, manifesto e URL do deployment. Não colocar chaves no código ou no GitHub. O manifesto deve permitir chamadas externas e acesso às planilhas, já utilizados pela integração existente.

Homologar metadados, consulta diária/mensal, busca, leitura de imagem, registro manual, edição e alteração de observação em cópia da planilha. Confirmar que as chamadas do frontend mandam token de sessão; o frontend candidato já o faz. Chamadas antigas sem token deixarão de funcionar. O endpoint de saúde também exige sessão nesta versão.

Não houve implantação nem teste com dados reais. Reverter requer retornar ao deployment anterior, não apenas ao frontend.
