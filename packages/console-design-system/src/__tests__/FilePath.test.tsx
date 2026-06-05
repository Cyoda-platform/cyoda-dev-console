import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThemeProvider } from "../ThemeProvider";
import { FilePath } from "../FilePath";

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("FilePath", () => {
  it("renders the path as code text", () => {
    wrap(<FilePath path="/proj/workflows/order.json" />);
    expect(screen.getByText("/proj/workflows/order.json")).toBeInTheDocument();
  });

  it("does not render a copy button when copyable is false (default)", () => {
    wrap(<FilePath path="/proj/file.json" />);
    expect(screen.queryByRole("button", { name: "Copy path" })).not.toBeInTheDocument();
  });

  it("renders the copy button when copyable is true", () => {
    wrap(<FilePath path="/proj/file.json" copyable />);
    expect(screen.getByRole("button", { name: "Copy path" })).toBeInTheDocument();
  });

  it("copy button has title 'Copy path' before clicking", () => {
    wrap(<FilePath path="/proj/file.json" copyable />);
    expect(screen.getByRole("button", { name: "Copy path" })).toHaveAttribute(
      "title",
      "Copy path",
    );
  });

  describe("clipboard interaction", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("writes the path to the clipboard on click", async () => {
      wrap(<FilePath path="/proj/file.json" copyable />);
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/proj/file.json"),
      );
    });

    it("changes title to 'Copied!' after a successful copy", async () => {
      wrap(<FilePath path="/proj/file.json" copyable />);
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
      await waitFor(() =>
        expect(screen.getByTitle("Copied!")).toBeInTheDocument(),
      );
    });
  });
});
