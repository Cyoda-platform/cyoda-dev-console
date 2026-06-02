import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Tabs } from "../Tabs";
import { ThemeProvider } from "../ThemeProvider";

const tabs = [
  { id: "a", label: "Connect" },
  { id: "b", label: "Bundle" },
];

describe("Tabs", () => {
  it("marks the active tab as selected", () => {
    render(
      <ThemeProvider>
        <Tabs tabs={tabs} activeId="a" onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("tab", { name: "Connect" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Bundle" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("calls onChange with the tab id when clicked", () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider>
        <Tabs tabs={tabs} activeId="a" onChange={onChange} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Bundle" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
