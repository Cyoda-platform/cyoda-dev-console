import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppFrame } from "../AppFrame";

describe("AppFrame", () => {
  it("renders the title and children", () => {
    render(
      <AppFrame title="Cyoda Dev Console" navItems={[]}>
        <div>Body content</div>
      </AppFrame>,
    );
    expect(screen.getByText("Cyoda Dev Console")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders nav items as buttons", () => {
    render(
      <AppFrame
        title="App"
        navItems={[{ id: "a", label: "Workflows", onSelect: () => {} }]}
      >
        <div />
      </AppFrame>,
    );
    expect(screen.getByRole("button", { name: "Workflows" })).toBeInTheDocument();
  });
});
