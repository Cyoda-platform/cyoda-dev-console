import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { HeaderContext } from "../components/HeaderContext.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("HeaderContext", () => {
  it("shows the project name badge", () => {
    wrap(<HeaderContext projectName="order-demo" dirty={false} />);
    expect(screen.getByText("order-demo")).toBeInTheDocument();
  });

  it("shows the dirty indicator when dirty", () => {
    wrap(<HeaderContext projectName="demo" dirty={true} />);
    expect(screen.getByText("●")).toBeInTheDocument();
  });

  it("hides the dirty indicator when clean", () => {
    wrap(<HeaderContext projectName="demo" dirty={false} />);
    expect(screen.queryByText("●")).not.toBeInTheDocument();
  });
});
