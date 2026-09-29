import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WindowControls } from "./TitleBar";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    throw new TypeError("Cannot read properties of undefined (reading 'metadata')");
  },
}));

vi.mock("@/hooks/useHistoryNav", () => ({
  useHistoryNav: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    canGoBack: false,
  }),
}));

describe("WindowControls", () => {
  it("renders Windows caption buttons on the right order when Tauri is missing", () => {
    render(<WindowControls />);
    const buttons = screen.getAllByRole("button").filter((el) => el.getAttribute("aria-label"));
    expect(buttons.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Minimize",
      "Maximize",
      "Close",
    ]);
  });
});
