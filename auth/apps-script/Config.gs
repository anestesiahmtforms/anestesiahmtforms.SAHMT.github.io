// Configuração original preservada; a planilha inclui dispositivos e histórico de autenticação.
const SPREADSHEET_NAME = "Etiquetas";
const SPREADSHEET_ID = "1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY";
const REGISTROS_SHEET = "ETIQUETA";
const LISTAS_SHEET = "Listas";
const OPENAI_MODEL = "gpt-5.2";
const OPENAI_API_KEY_PROPERTY = "OPENAI_API_KEY";
const GOOGLE_CLIENT_ID = "908976987584-o59p0obmvq013lg3t9726itf06e15v2c.apps.googleusercontent.com";
const TRUSTED_DEVICES_SHEET = "DISPOSITIVOS_CONFIAVEIS";
const ACCESS_HISTORY_SHEET = "HISTORICO_ACESSO_SAHMT";
const AUTHORIZED_EMAILS = [
  "giovannoni1806@gmail.com", "igorfagundesvieira@gmail.com", "jaymebc@gmail.com", "lalvesaraujo1@gmail.com",
  "leodcp1@gmail.com", "luc3101@gmail.com", "lucas.cardoso.andrade@gmail.com", "luciah1509@gmail.com",
  "macielfonseca@gmail.com", "marcio.henrique82@gmail.com", "deilerjeunon19@gmail.com", "deneradiniz@gmail.com",
  "digoanest@gmail.com", "ericardolucas@gmail.com", "rafael.augusto.rezende@gmail.com", "rodrigocapuano12@gmail.com",
  "vcrelio@gmail.com", "wx2064@gmail.com", "25.guilherme@gmail.com", "adelsonjm@gmail.com",
  "adrianonevesdealmeida1966@gmail.com", "barbararcoutinho@gmail.com", "bovino3.lf@gmail.com", "wendellvcp@gmail.com",
  "gpbicalho@gmail.com", "decastromorais@gmail.com", "luizacs4182@gmail.com", "luizotavio.andrade@gmail.com",
  "paulorenato12021@gmail.com", "rubenscpinheiro0217@gmail.com", "nyhumberto@gmail.com", "marianasantosbrant@gmail.com",
  "anacarolinacbo1@gmail.com", "anandaqrlima@gmail.com", "lucasreis611@gmail.com", "araujo.barbaral44@gmail.com",
  "peereiralana@gmail.com", "bernardofsilvestrini@gmail.com", "eduardorfamaral@gmail.com", "aliciafreire98@gmail.com",
  "livia.campos12@gmail.com", "isapinvin@gmail.com", "na.tigre0@gmail.com", "matheusspiccolo2@gmail.com",
  "leonardoantonio2000sg@gmail.com", "joaoboscom28@gmail.com", "igorsmatias@gmail.com", "gbgabri3@gmail.com",
  "richard.fernandes.sousa@gmail.com", "lucasmarquesdrumond@gmail.com", "beguimaraes3@gmail.com", "brunacandida@gmail.com",
  "carolassisval@gmail.com", "nandobracar@gmail.com", "vieiraa.jessica09@gmail.com"
,
    "meireservolo@gmail.com", "rosangelaservolo@gmail.com", "wx2901@gmail.com"
];

const REGISTROS_HEADERS = [
  "Data",
  "Nome do Paciente",
  "Convênio",
  "Cirurgia",
  "Atendimento",
  "Tipo",
  "Credor",
  "Plantonista(s)",
  "Observacoes",
  "Criado em",
  "Criado por",
  "Observacao atualizada em",
  "Observacao atualizada por",
  "Editado em",
  "Editado por",
  "Resumo da edicao",
  "Valor",
];

const TIPO_OPTIONS = ["Particular", "Complementação", "Convênio", "Consulta Pré-anestésica"];
const CREDOR_OPTIONS = ["Caixa", "Plantão", "Plantão/Caixa"];
const PLANTONISTA_OPTIONS = [
  "AD", "AA", "AL", "BA", "CH", "CR", "DE", "DN", "FL", "FR", "GU", "GB", "IG", "JA",
  "L2", "LE", "LD", "LC", "LH", "LU", "LA", "LO", "MA", "MH", "PR", "RA", "RL", "RC",
  "RO", "RU", "WE",
];

