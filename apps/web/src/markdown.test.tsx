import { fireEvent, render, screen, waitFor, within, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./ui/Markdown";
import { ChatImageGallery } from "./ui/ChatImageGallery";
import type { ChatMessageImage } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderInMessage(ui: ReactElement): RenderResult {
  return render(
    <article className="message message-assistant">
      <div className="message-content">
        <div className="final-answer">{ui}</div>
      </div>
    </article>
  );
}

const copFormulaSource = [
  "## COP (製冷效能係數) for Your Chillers",
  "",
  "COP = Coefficient of Performance — the key efficiency metric for chillers:",
  "",
  "$$ \\text{COP} = \\frac{\\text{Cooling Output (kW)}}{\\text{Electrical Input (kW)}} $$"
].join("\n");

describe("Markdown renderer", () => {
  it("renders headings, lists, inline formatting, and links with safe target", () => {
    render(
      <Markdown
        source={[
          "# Title",
          "",
          "Paragraph with **bold**, _italic_, and `inline()` plus a [BuildingGPT](https://example.test) link.",
          "",
          "- alpha",
          "- beta",
          "",
          "1. first",
          "2. second"
        ].join("\n")}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "BuildingGPT" });
    expect(link).toHaveAttribute("href", "https://example.test");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("inline()").tagName).toBe("CODE");
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0]!).getByText("alpha")).toBeInTheDocument();
    expect(within(lists[1]!).getByText("first")).toBeInTheDocument();
  });

  it("renders fenced code blocks with a copy button that fires onCopyCode", async () => {
    const onCopyCode = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = (navigator as { clipboard?: unknown }).clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText }
    });
    const previousExecCommand = (document as unknown as { execCommand?: unknown }).execCommand;
    (document as unknown as { execCommand?: (...args: unknown[]) => boolean }).execCommand = () => true;

    try {
      render(<Markdown source={"```ts\nconst answer = 42;\n```"} onCopyCode={onCopyCode} />);

      expect(screen.getByText("ts")).toBeInTheDocument();
      expect(screen.getByText(/const answer = 42;/)).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /copy/i }));
      await waitFor(() => expect(onCopyCode).toHaveBeenCalledWith("const answer = 42;"));
      await waitFor(() => expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument());
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        writable: true,
        value: previousClipboard
      });
      (document as unknown as { execCommand?: unknown }).execCommand = previousExecCommand;
    }
  });

  it("renders tables with header and body rows", () => {
    render(
      <Markdown
        source={[
          "| Column | Value |",
          "| --- | --- |",
          "| Alpha | 1 |",
          "| Beta | 2 |"
        ].join("\n")}
      />
    );
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Column", "Value"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("cell", { name: "Alpha" })).toBeInTheDocument();
  });

  it("does not break markdown links that already wrap outputs paths", () => {
    const source =
      "- CSV: [chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv)";
    render(
      <Markdown
        source={source}
        resolveLinkUrl={(url) => `/api/projects/project_element/repository/files/${url}?token=test`}
      />
    );
    const link = screen.getByRole("link", { name: "chiller_plant_bms_point_list.csv" });
    expect(link.getAttribute("href")).toBe(
      "/api/projects/project_element/repository/files/outputs/chiller_plant_bms_point_list.csv?token=test"
    );
  });

  it("renders repository output download links when resolveLinkUrl is provided", () => {
    render(
      <Markdown
        source={"Download: [chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv)"}
        resolveLinkUrl={(url) => `/api/projects/project_element/repository/files/${url}?token=test`}
      />
    );
    const link = screen.getByRole("link", { name: "chiller_plant_bms_point_list.csv" });
    expect(link).toHaveAttribute(
      "href",
      "/api/projects/project_element/repository/files/outputs/chiller_plant_bms_point_list.csv?token=test"
    );
    expect(link).toHaveAttribute("download", "chiller_plant_bms_point_list.csv");
  });

  it("renders blockquotes and horizontal rules", () => {
    const { container } = render(<Markdown source={"> A quoted line.\n\n---\n\nAfter rule."} />);
    expect(container.querySelector("blockquote")?.textContent).toContain("A quoted line.");
    expect(container.querySelector(".md-break")).toBeInTheDocument();
    expect(screen.getByText("After rule.")).toBeInTheDocument();
  });

  it("renders display and inline LaTeX formulas inside message DOM", () => {
    const { container } = renderInMessage(
      <Markdown
        source={[
          "$$ \\text{COP} = \\frac{\\text{Cooling Output (kW)}}{\\text{Electrical Input (kW)}} $$",
          "",
          "Inline $E = mc^2$ example."
        ].join("\n")}
      />
    );
    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toMatch(/COP/i);
    expect(container.textContent).toMatch(/mc/);
  });

  it("renders COP fraction with visible frac-line inside message DOM", () => {
    const { container } = renderInMessage(<Markdown source={copFormulaSource} />);

    const fracLine = container.querySelector(".katex-display .frac-line");
    expect(fracLine).toBeInTheDocument();

    const styles = window.getComputedStyle(fracLine!);
    expect(styles.borderBottomStyle).not.toBe("none");
    expect(Number.parseFloat(styles.borderBottomWidth)).toBeGreaterThan(0);

    const display = container.querySelector(".katex-display");
    expect(display).toBeInTheDocument();
    const displayStyles = window.getComputedStyle(display!);
    expect(displayStyles.overflowY).not.toBe("auto");
    expect(displayStyles.overflowY).not.toBe("scroll");

    expect(container.textContent).toMatch(/Cooling/i);
    expect(container.textContent).toMatch(/Electrical/i);
  });

  it("normalizes GPT-style \\(...\\) and \\[...\\] delimiters", () => {
    const { container } = renderInMessage(
      <Markdown
        source={[
          "\\[ E = mc^2 \\]",
          "",
          "Inline \\(a + b\\) example."
        ].join("\n")}
      />
    );

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.textContent).toMatch(/mc/);
    expect(container.textContent).toMatch(/a/);
    expect(container.textContent).toMatch(/b/);
  });

  it("does not normalize math delimiters inside fenced code blocks", () => {
    const { container } = renderInMessage(
      <Markdown source={"```text\n\\(not math\\)\n```\n\nReal \\(x\\) math."} />
    );

    expect(container.querySelector("pre")?.textContent).toContain("\\(not math\\)");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ChatImageGallery", () => {
  const images = [
    { src: "/mock/a.png", alt: "Mock A", filename: "alpha.png", capturedAt: "2026-05-11", source: "task_alpha" },
    { src: "/mock/b.png", alt: "Mock B", filename: "beta.png" }
  ];

  it("renders a clickable image per attachment and opens a lightbox preview", async () => {
    render(<ChatImageGallery images={images} messageId="msg-1" resolveImageUrl={(url) => `/resolved/${url}`} />);

    const cards = screen.getAllByRole("button", { name: /enlarge image/i });
    expect(cards).toHaveLength(2);
    expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", "/resolved//mock/a.png");

    const user = userEvent.setup();
    await user.click(cards[0]!);
    const dialog = screen.getByRole("dialog", { name: "alpha.png" });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "/resolved//mock/a.png");
    expect(within(dialog).getByText(/Captured 2026-05-11/)).toBeInTheDocument();
  });

  it("closes the lightbox on Escape and on close-button click", async () => {
    render(<ChatImageGallery images={images} messageId="msg-2" />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole("button", { name: /enlarge image/i })[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: /enlarge image/i })[0]!);
    await user.click(screen.getByRole("button", { name: /close image preview/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can render a deduped single image when markdown already references the same file", () => {
    const images: ChatMessageImage[] = [
      { src: "outputs/chart.png", alt: "Chart", filename: "chart.png" }
    ];

    render(
      <>
        <Markdown source={"![Chart](outputs/chart.png)"} resolveImageUrl={(url) => `/api/projects/project_alpha/repository/files/${url}`} />
        <ChatImageGallery images={images} messageId="msg-dedupe" resolveImageUrl={(url) => `/api/projects/project_alpha/repository/files/${url}`} />
      </>
    );

    expect(screen.getAllByRole("img", { name: /chart/i }).length).toBeGreaterThanOrEqual(1);
  });
});
