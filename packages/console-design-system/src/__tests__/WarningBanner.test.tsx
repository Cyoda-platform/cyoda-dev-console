import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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
});
