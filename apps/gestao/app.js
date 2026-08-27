const managementItems = [
  {
    title: "GESTÃO DE DOCUMENTOS",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "COORDENAÇÃO ADMINISTRATIVA",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO OPERACIONAL",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "COORDENAÇÃO CLÍNICA",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DA QUALIDADE",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DAS ÁREAS ASSISTENCIAIS EXTRA BLOCO",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DE CONDUTA ÉTICA",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DE EQUIPAMENTOS",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DE PESSOAS",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DE PRONTUÁRIO",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO DO AMBULATÓRIO PRÉ-ANESTÉSICO",
    gestorUrl: "#",
    equipeUrl: "#"
  },
  {
    title: "GESTÃO FINANCEIRA",
    gestorUrl: "#",
    equipeUrl: "#"
  }
];

const themes = [
  ["#ff7b49", "#ff2d74", "#a249ff"],
  ["#40f2ff", "#166cff", "#0639d0"],
  ["#73ffb8", "#19c87f", "#0b8a72"],
  ["#ffd333", "#ff8a00", "#e95a00"],
  ["#f59bff", "#be32ff", "#6d4dff"],
  ["#5ddfff", "#338cff", "#2350ff"],
  ["#ffe05d", "#ffb21f", "#ff7500"],
  ["#60f5e0", "#24c9ba", "#06969d"]
];

const iconGrid = document.querySelector("#iconGrid");
const cardTemplate = document.querySelector("#cardTemplate");
const folderOverlay = document.querySelector("#folderOverlay");
const folderBackdrop = document.querySelector("#folderBackdrop");
const closeFolder = document.querySelector("#closeFolder");
const folderGlyph = document.querySelector("#folderGlyph");
const folderTitle = document.querySelector("#folderTitle");
const folderSubtitle = document.querySelector("#folderSubtitle");
const folderGestor = document.querySelector("#folderGestor");
const folderEquipe = document.querySelector("#folderEquipe");

function formatLabel(text) {
  return text
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (char) => char.toUpperCase())
    .replace(/\bDc\b/g, "DC");
}

function splitIntoBalancedLines(title) {
  const words = formatLabel(title).split(/\s+/).filter(Boolean);

  if (words.length <= 2) {
    return words.join(" ");
  }

  const candidates = [];

  const pushCandidate = (lines) => {
    const lengths = lines.map((line) => line.length);
    const range = Math.max(...lengths) - Math.min(...lengths);
    const score = range + (lines.length - 2) * 1.35;
    candidates.push({ lines, score });
  };

  for (let i = 1; i < words.length; i += 1) {
    pushCandidate([
      words.slice(0, i).join(" "),
      words.slice(i).join(" ")
    ]);
  }

  if (words.length >= 4) {
    for (let i = 1; i < words.length - 1; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        pushCandidate([
          words.slice(0, i).join(" "),
          words.slice(i, j).join(" "),
          words.slice(j).join(" ")
        ]);
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].lines.filter(Boolean).join("\n");
}

function getIconSizeClass(title) {
  const length = formatLabel(title).length;

  if (length > 40) {
    return "is-dense";
  }

  if (length > 28) {
    return "is-compact";
  }

  return "is-regular";
}

function setTheme(element, index) {
  const theme = themes[index % themes.length];
  element.style.setProperty("--icon-a", theme[0]);
  element.style.setProperty("--icon-b", theme[1]);
  element.style.setProperty("--icon-c", theme[2]);
}

function configureLink(link, url, itemTitle, audienceLabel) {
  link.href = url;
  link.dataset.url = url;
  link.dataset.item = itemTitle;
  link.dataset.audience = audienceLabel;
  link.onclick = null;

  if (url === "#") {
    link.onclick = (event) => {
      event.preventDefault();
      window.alert(`Informe o link de ${audienceLabel} para: ${formatLabel(itemTitle)}`);
    };
  }
}

function openFolder(item, index) {
  window.SAHMT_AUTH?.track("area_open", formatLabel(item.title));
  folderTitle.textContent = formatLabel(item.title);
  folderSubtitle.textContent = "Escolha a ação desejada.";
  folderGlyph.textContent = splitIntoBalancedLines(item.title);
  setTheme(folderGlyph, index);
  configureLink(folderGestor, item.gestorUrl, item.title, "Gestor");
  configureLink(folderEquipe, item.equipeUrl, item.title, "Equipe");

  folderOverlay.classList.remove("hidden");
  folderOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("folder-open");
}

function closeFolderOverlay() {
  folderOverlay.classList.add("hidden");
  folderOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("folder-open");
}

function renderCards() {
  const fragment = document.createDocumentFragment();

  managementItems.forEach((item, index) => {
    const tile = cardTemplate.content.firstElementChild.cloneNode(true);
    const text = tile.querySelector(".app-icon__text");
    const sizeClass = getIconSizeClass(item.title);

    text.textContent = splitIntoBalancedLines(item.title);
    text.className = `app-icon__text ${sizeClass}`;
    setTheme(text, index);
    tile.style.animationDelay = `${index * 46}ms`;
    tile.dataset.index = String(index + 1);
    tile.setAttribute("aria-label", formatLabel(item.title));
    tile.addEventListener("click", () => openFolder(item, index));

    fragment.appendChild(tile);
  });

  iconGrid.appendChild(fragment);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js?v=20260823-7", { updateViaCache: "none" }).catch(() => {
        // The app still works without the service worker.
      });
    });
  }
}

if (folderBackdrop) {
  folderBackdrop.addEventListener("click", closeFolderOverlay);
}

if (closeFolder) {
  closeFolder.addEventListener("click", closeFolderOverlay);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !folderOverlay.classList.contains("hidden")) {
    closeFolderOverlay();
  }
});

document.addEventListener("click", (event) => {
  if (event.target === folderOverlay) {
    closeFolderOverlay();
  }
});

async function bootstrapManagementApp() {
  if (window.SAHMT_AUTH?.requireAccess) {
    await window.SAHMT_AUTH.requireAccess({
      moduleId: "GESTAO",
      pageId: "home",
      returnUrl: window.location.href
    });
  }

  renderCards();
  registerServiceWorker();
}

bootstrapManagementApp();
