import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@cyoda/console-design-system";
import { JsonTree } from "../JsonTree.js";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("JsonTree", () => {
  it("renders string primitive with JSON.stringify quoting", () => {
    wrap(<JsonTree value="hello world" label="key" />);
    expect(screen.getByText('"hello world"')).toBeDefined();
  });

  it("renders number primitive", () => {
    wrap(<JsonTree value={42} label="n" />);
    expect(screen.getByText("42")).toBeDefined();
  });

  it("renders boolean primitive", () => {
    wrap(<JsonTree value={true} label="flag" />);
    expect(screen.getByText("true")).toBeDefined();
  });

  it("renders null as italic null", () => {
    wrap(<JsonTree value={null} />);
    expect(screen.getByText("null")).toBeDefined();
  });

  it("collapses children when collapse button is clicked", () => {
    wrap(<JsonTree value={{ a: "one", b: "two" }} />);
    // Both values visible initially
    expect(screen.getByText('"one"')).toBeDefined();
    expect(screen.getByText('"two"')).toBeDefined();

    // Click the collapse button (▾)
    fireEvent.click(screen.getByText("▾"));

    // Children no longer rendered
    expect(screen.queryByText('"one"')).toBeNull();
    expect(screen.queryByText('"two"')).toBeNull();
  });

  it("re-expands after collapsing", () => {
    wrap(<JsonTree value={{ x: 99 }} />);
    fireEvent.click(screen.getByText("▾"));
    fireEvent.click(screen.getByText("▸"));
    expect(screen.getByText("99")).toBeDefined();
  });

  it("renders array entries with numeric keys", () => {
    wrap(<JsonTree value={["a", "b"]} />);
    expect(screen.getByText('"a"')).toBeDefined();
    expect(screen.getByText('"b"')).toBeDefined();
  });
});
