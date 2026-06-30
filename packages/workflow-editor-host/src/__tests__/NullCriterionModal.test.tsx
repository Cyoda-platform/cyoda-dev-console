import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { NullCriterionModal } from "../NullCriterionModal.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const paths = ["workflows.0.criterion", "workflows.0.states.A.transitions.0.criterion"];

describe("NullCriterionModal", () => {
  it("explains that the cause is criterion: null", () => {
    wrap(<NullCriterionModal paths={paths} onApply={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/criterion.*:\s*null/i)).toBeInTheDocument();
  });

  it("lists the affected locations", () => {
    wrap(<NullCriterionModal paths={paths} onApply={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("workflows.0.states.A.transitions.0.criterion")).toBeInTheDocument();
  });

  it("calls onApply when the drop-null-criteria button is clicked", () => {
    const onApply = vi.fn();
    wrap(<NullCriterionModal paths={paths} onApply={onApply} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /drop null criteria/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    wrap(<NullCriterionModal paths={paths} onApply={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
