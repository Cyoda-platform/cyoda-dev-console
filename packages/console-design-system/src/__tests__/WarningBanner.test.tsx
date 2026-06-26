import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider } from "../ThemeProvider";
import { WarningBanner } from "../WarningBanner";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("WarningBanner", () => {
  it("renders children", () => {
    wrap(<WarningBanner>Something went wrong.</WarningBanner>);
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("has role='alert'", () => {
    wrap(<WarningBanner>Alert!</WarningBanner>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders with default warning severity without errors", () => {
    wrap(<WarningBanner>Default warning</WarningBanner>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders with caution severity without errors", () => {
    wrap(<WarningBanner severity="caution">Caution!</WarningBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Caution!");
  });

  it("renders with success severity without errors", () => {
    wrap(<WarningBanner severity="success">Applied changes.</WarningBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Applied changes.");
  });

  it("renders ReactNode children (not just strings)", () => {
    wrap(
      <WarningBanner>
        <strong>Bold text</strong> and plain text.
      </WarningBanner>,
    );
    expect(screen.getByText("Bold text")).toBeInTheDocument();
  });

  it("renders with info severity without errors", () => {
    wrap(<WarningBanner severity="info">Heads up.</WarningBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Heads up.");
  });

  it("renders no dismiss button when onDismiss is absent", () => {
    wrap(<WarningBanner>No dismiss here.</WarningBanner>);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("renders a dismiss button and calls onDismiss when clicked", () => {
    const onDismiss = vi.fn();
    wrap(
      <WarningBanner severity="info" onDismiss={onDismiss}>
        Dismiss me.
      </WarningBanner>,
    );
    const btn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
