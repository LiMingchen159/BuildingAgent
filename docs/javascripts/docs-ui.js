(() => {
  const statusPatterns = [
    ["candidate", /^(?:候选|Candidate)(?:\s*\/|\s*·|\s*\(|\s|$)/i],
    ["implemented", /^(?:已实现|Implemented)(?:\s*\/|\s*\+|\s*\(|\s|$)/i],
    ["partial", /^(?:部分实现|Partial)(?:\s*\/|\s*\+|\s*\(|\s|$)/i],
    ["planned", /^(?:规划中|Planned)(?:\s*\/|\s*\+|\s*\(|\s|$)/i],
    ["external", /^(?:外部能力|External)(?:\s*\/|\s*\+|\s*\(|\s|$)/i],
  ];

  const normalizedText = (element) =>
    element.textContent.replace(/\s+/g, " ").trim();

  const classifyStatus = (text) => {
    if (text.length > 74) return null;

    const statusSignals = [
      /已实现|Implemented/i,
      /部分实现|Partial/i,
      /规划中|Planned/i,
      /外部能力|External/i,
      /候选|Candidate/i,
    ].filter((pattern) => pattern.test(text));

    if (statusSignals.length > 1) return "mixed";

    for (const [status, pattern] of statusPatterns) {
      if (pattern.test(text)) return status;
    }

    if (/候选\s*\/\s*未合并|Candidate\s*\/\s*unmerged/i.test(text)) {
      return "candidate";
    }

    return null;
  };

  const enhancePageTools = (root) => {
    root.querySelectorAll(".md-typeset h1 + p").forEach((paragraph) => {
      if (paragraph.classList.contains("ba-page-tools")) return;

      const links = paragraph.querySelectorAll(":scope > a");
      if (links.length < 2 || !normalizedText(paragraph).includes("|")) return;

      paragraph.classList.add("ba-page-tools");
      paragraph.setAttribute("role", "navigation");
      paragraph.setAttribute("aria-label", "Page links");
    });
  };

  const enhanceBaselines = (root) => {
    root.querySelectorAll(".md-typeset blockquote").forEach((quote) => {
      const text = normalizedText(quote);
      if (
        /^(?:代码基线|产品代码基线|Code baseline|Product code baseline)/i.test(
          text,
        )
      ) {
        quote.classList.add("ba-baseline");
      }
    });
  };

  const enhanceTables = (root) => {
    root.querySelectorAll(".md-typeset table").forEach((table) => {
      const headers = [...table.querySelectorAll(":scope > thead > tr > th")];
      const statusColumns = new Set(
        headers
          .map((header, index) => [normalizedText(header), index])
          .filter(([text]) =>
            /^(?:状态|Status|Current status|BuildingAgent status)$/i.test(text),
          )
          .map(([, index]) => index),
      );

      table.querySelectorAll(":scope > tbody > tr").forEach((row) => {
        [...row.cells].forEach((cell, index) => {
          if (cell.dataset.baEnhanced === "true") return;

          const text = normalizedText(cell);
          if (statusColumns.has(index)) {
            const status = classifyStatus(text);
            if (status) {
              cell.classList.add("ba-status-cell", `ba-status--${status}`);
            }
          }

          if (/^-?[\d,.]+(?:\s*%|\s*ms|\s*s)?$/.test(text)) {
            cell.classList.add("ba-numeric");
          }

          cell.dataset.baEnhanced = "true";
        });
      });
    });
  };

  const getDiagramDialog = () => {
    let dialog = document.querySelector(".ba-diagram-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "ba-diagram-dialog";

    const bar = document.createElement("div");
    bar.className = "ba-diagram-dialog__bar";

    const title = document.createElement("span");
    title.className = "ba-diagram-dialog__title";
    title.id = "ba-diagram-dialog-title";
    dialog.setAttribute("aria-labelledby", title.id);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ba-diagram-dialog__close";
    close.textContent = "Close / 关闭";
    close.addEventListener("click", () => dialog.close());

    const viewport = document.createElement("div");
    viewport.className = "ba-diagram-dialog__viewport";

    bar.append(title, close);
    dialog.append(bar, viewport);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);

    return dialog;
  };

  const openDiagram = (image) => {
    const dialog = getDiagramDialog();
    if (typeof dialog.showModal !== "function") {
      window.open(image.src, "_blank", "noopener,noreferrer");
      return;
    }

    const title = dialog.querySelector(".ba-diagram-dialog__title");
    const viewport = dialog.querySelector(".ba-diagram-dialog__viewport");
    const expandedImage = image.cloneNode();

    title.textContent = image.alt || "BuildingAgent diagram";
    expandedImage.removeAttribute("loading");
    expandedImage.removeAttribute("decoding");
    viewport.replaceChildren(expandedImage);
    dialog.showModal();
  };

  const enhanceDiagrams = (root) => {
    root.querySelectorAll('.md-typeset img[src$=".drawio.svg"]').forEach((image) => {
      image.loading = "lazy";
      image.decoding = "async";

      const container = image.closest("p");
      if (!container) return;

      container.classList.add("ba-diagram");
      if (container.querySelector(".ba-diagram__expand")) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ba-diagram__expand";
      button.textContent = "Expand / 放大";
      button.setAttribute("aria-label", `Expand ${image.alt || "diagram"}`);
      button.addEventListener("click", () => openDiagram(image));
      container.prepend(button);
    });
  };

  const enhanceDocument = () => {
    document.documentElement.lang = location.pathname.includes("/zh-CN/")
      ? "zh-CN"
      : "en";

    const root = document;
    enhancePageTools(root);
    enhanceBaselines(root);
    enhanceTables(root);
    enhanceDiagrams(root);
  };

  if (typeof document$ !== "undefined") {
    document$.subscribe(enhanceDocument);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceDocument, { once: true });
  } else {
    enhanceDocument();
  }
})();
