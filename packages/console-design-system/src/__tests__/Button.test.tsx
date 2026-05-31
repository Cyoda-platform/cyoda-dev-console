import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "../Button";
import { ThemeProvider } from "../ThemeProvider";

describe("Button", () => {
  it("renders the label", () => {
    render(<ThemeProvider><Button>Save</Button></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
