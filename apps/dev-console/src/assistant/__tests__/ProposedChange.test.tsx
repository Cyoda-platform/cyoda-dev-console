import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProposedChange } from "../ProposedChange.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const base = {
  current: '{"importMode":"MERGE","workflows":[]}',
  proposed: '{"importMode":"MERGE","workflows":[{"name":"updated"}]}',
  applying: false,
  onApply: vi.fn(),
  onCancel: vi.fn(),
};

describe("ProposedChange", () => {
  it("renders the current and proposed diff panes", () => {
    wrap(<ProposedChange {...base} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText(base.current)).toBeInTheDocument();
    expect(screen.getByText(base.proposed)).toBeInTheDocument();
  });

  it("uses the default apply label 'Apply to file'", () => {
    wrap(<ProposedChange {...base} />);
    expect(screen.getByRole("button", { name: "Apply to file" })).toBeInTheDocument();
  });

  it("uses a custom applyLabel when provided", () => {
    wrap(<ProposedChange {...base} applyLabel="Apply to editor" />);
    expect(screen.getByRole("button", { name: "Apply to editor" })).toBeInTheDocument();
  });

  it("shows 'Applying…' and disables buttons while applying", () => {
    wrap(<ProposedChange {...base} applying={true} />);
    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("calls onApply when the apply button is clicked", () => {
    const onApply = vi.fn();
    wrap(<ProposedChange {...base} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply to file" }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the Cancel button is clicked", () => {
    const onCancel = vi.fn();
    wrap(<ProposedChange {...base} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
