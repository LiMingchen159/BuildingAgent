import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  Input,
  Pill,
  Textarea,
  type DropdownOption
} from "./ui/primitives";

describe("Button primitive", () => {
  it("applies variant and size classes and defaults to type=button", () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary" size="sm">Secondary</Button>
        <Button variant="ghost" size="lg">Ghost</Button>
      </>
    );

    const primary = screen.getByRole("button", { name: "Primary" });
    expect(primary).toHaveClass("btn", "btn-primary");
    expect(primary).toHaveAttribute("type", "button");

    expect(screen.getByRole("button", { name: "Secondary" })).toHaveClass("btn-secondary", "btn-sm");
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveClass("btn-ghost", "btn-lg");
  });

  it("disables and reports busy when loading", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Input and Textarea primitives", () => {
  it("renders an accessible labelled input with invalid styling and aria-invalid", () => {
    render(
      <label>
        Email
        <Input invalid placeholder="you@example.com" />
      </label>
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("input-control", "input-invalid");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("type", "text");
  });

  it("renders a labelled textarea with invalid state", () => {
    render(
      <label>
        Notes
        <Textarea invalid />
      </label>
    );
    const textarea = screen.getByLabelText("Notes");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveClass("textarea-control", "input-invalid");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Badge and Pill primitives", () => {
  it("applies tone classes and exports Pill alias", () => {
    render(
      <>
        <Badge tone="success">Active</Badge>
        <Pill tone="danger">Down</Pill>
      </>
    );
    expect(screen.getByText("Active")).toHaveClass("badge", "badge-success");
    expect(screen.getByText("Down")).toHaveClass("badge", "badge-danger");
    expect(Pill).toBe(Badge);
  });
});

describe("Avatar primitive", () => {
  it("renders initials and an accessible name when no image is provided", () => {
    render(<Avatar name="Ada Lovelace" />);
    const avatar = screen.getByRole("img", { name: "Ada Lovelace" });
    expect(avatar).toHaveClass("avatar", "avatar-md");
    expect(avatar).toHaveTextContent("AL");
  });

  it("falls back to initials when the image fails to load", () => {
    render(<Avatar name="Grace Hopper" src="/missing.png" />);
    const avatar = screen.getByRole("img", { name: "Grace Hopper" });
    const img = avatar.querySelector("img");
    expect(img).toBeTruthy();
    fireEvent.error(img!);
    expect(avatar).toHaveTextContent("GH");
  });

  it("derives a single-letter avatar from a single-word name", () => {
    render(<Avatar name="hopper" size="sm" />);
    expect(screen.getByRole("img", { name: "hopper" })).toHaveTextContent("HO");
  });
});

describe("Dropdown primitive", () => {
  const options: ReadonlyArray<DropdownOption> = [
    { value: "alpha", label: "Alpha" },
    { value: "beta", label: "Beta" },
    { value: "gamma", label: "Gamma", disabled: true },
    { value: "delta", label: "Delta" }
  ];

  function Harness({ initial = null as string | null }: { initial?: string | null } = {}) {
    const [value, setValue] = useState<string | null>(initial);
    return (
      <Dropdown
        label="Pick a project"
        options={options}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("opens, exposes listbox semantics, and selects via mouse", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Pick a project" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("Select an option");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Pick a project" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(trigger).toHaveTextContent("Beta");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow-key navigation and Enter to commit, skipping disabled options", async () => {
    const user = userEvent.setup();
    render(<Harness initial="alpha" />);
    const trigger = screen.getByRole("button", { name: "Pick a project" });
    trigger.focus();

    await user.keyboard("{ArrowDown}");
    // open: active starts at selected (alpha, index 0). One ArrowDown -> beta.
    expect(screen.getByRole("option", { name: "Beta" })).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{ArrowDown}");
    // gamma is disabled, so skip to delta.
    await user.keyboard("{Enter}");
    expect(trigger).toHaveTextContent("Delta");
  });

  it("closes on Escape without changing selection", async () => {
    const user = userEvent.setup();
    render(<Harness initial="alpha" />);
    const trigger = screen.getByRole("button", { name: "Pick a project" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Alpha");
  });
});
