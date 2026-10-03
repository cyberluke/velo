import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SenderAvatar } from "./SenderAvatar";

describe("SenderAvatar brand logos", () => {
  it("renders the bundled brand logo for a known company domain (nvidia.com)", () => {
    const { container } = render(<SenderAvatar email="jobs@nvidia.com" name="NVIDIA" className="w-9 h-9" />);
    // A recognisable brand mark: an inline SVG on a white circle, no <img>,
    // no initial letter.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText("N")).toBeNull();
  });

  it("resolves through a subdomain to the parent brand", () => {
    const { container } = render(<SenderAvatar email="devrel@updates.openai.com" name="OpenAI" className="w-9 h-9" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls through to the initial chain for an unknown domain", () => {
    const { container } = render(<SenderAvatar email="ada@example.net" name="Ada" className="w-9 h-9" />);
    // Unknown domain → gravatar attempt first (an <img>), never a brand svg.
    expect(container.querySelector("svg")).toBeNull();
  });
});