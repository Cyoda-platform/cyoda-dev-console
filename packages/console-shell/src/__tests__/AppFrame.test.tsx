import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppFrame } from "../AppFrame";

describe("AppFrame", () => {
  it("renders the title and children", () => {
    render(
      <AppFrame title="Cyoda Dev Console">
        <div>Body content</div>
      </AppFrame>,
    );
    expect(screen.getByText("Cyoda Dev Console")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders headerRight content", () => {
    render(
      <AppFrame title="App" headerRight={<span>Project Badge</span>}>
        <div />
      </AppFrame>,
    );
    expect(screen.getByText("Project Badge")).toBeInTheDocument();
  });
});
