import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./ui/Markdown";
import { ChatImageGallery } from "./ui/ChatImageGallery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Markdown renderer", () => {
  it("renders headings, lists, inline formatting, and links with safe target", () => {
    render(
      <Markdown
        source={[
          "# Title",
          "",
          "Paragraph with **bold**, _italic_, and `inline()` plus a [BuildingAgent](https://example.test) link.",
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
    const link = screen.getByRole("link", { name: "BuildingAgent" });
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

  it("renders blockquotes and horizontal rules", () => {
    const { container } = render(<Markdown source={"> A quoted line.\n\n---\n\nAfter rule."} />);
    expect(container.querySelector("blockquote")?.textContent).toContain("A quoted line.");
    expect(container.querySelector("hr")).toBeInTheDocument();
    expect(screen.getByText("After rule.")).toBeInTheDocument();
  });
});

describe("ChatImageGallery", () => {
  const images = [
    { src: "/mock/a.png", alt: "Mock A", filename: "alpha.png", capturedAt: "2026-05-11", source: "task_alpha" },
    { src: "/mock/b.png", alt: "Mock B", filename: "beta.png" }
  ];

  it("renders a clickable card per image and opens a lightbox preview with metadata", async () => {
    render(<ChatImageGallery images={images} messageId="msg-1" />);

    const cards = screen.getAllByRole("button", { name: /enlarge image/i });
    expect(cards).toHaveLength(2);
    expect(screen.getByText("alpha.png")).toBeInTheDocument();
    expect(screen.getByText(/Captured: 2026-05-11/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(cards[0]!);
    const dialog = screen.getByRole("dialog", { name: "alpha.png" });
    expect(within(dialog).getByText(/Source task_alpha/)).toBeInTheDocument();
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
});
