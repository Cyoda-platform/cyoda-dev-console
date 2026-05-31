import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { HeaderContext } from "../components/HeaderContext.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("HeaderContext", () => {
  it("shows the project name", () => {
    wrap(<HeaderContext projectName="order-demo" rootPath="/home/user/order-demo" dirty={false} openFilePath={null} />);
    expect(screen.getByText("order-demo")).toBeInTheDocument();
  });

  it("shows the dirty indicator when dirty", () => {
    wrap(<HeaderContext projectName="demo" rootPath="/x" dirty={true} openFilePath={null} />);
    expect(screen.getByText("●")).toBeInTheDocument();
  });

  it("hides the dirty indicator when clean", () => {
    wrap(<HeaderContext projectName="demo" rootPath="/x" dirty={false} openFilePath={null} />);
    expect(screen.queryByText("●")).not.toBeInTheDocument();
  });

  it("shows the open file basename", () => {
    wrap(<HeaderContext projectName="demo" rootPath="/x" dirty={false} openFilePath="/projects/workflows/order.json" />);
    expect(screen.getByText("order.json")).toBeInTheDocument();
  });
});
