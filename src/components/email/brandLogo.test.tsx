import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { registrableDomain, resolveBrandMark, BRAND_LOGOS } from "./brandLogo";

describe("registrableDomain", () => {
  it("reduces a subdomain to the registrable two-labelled domain", () => {
    expect(registrableDomain("mail.nvidia.com")).toBe("nvidia.com");
    expect(registrableDomain("updates.github.com")).toBe("github.com");
    expect(registrableDomain("nvidia.com")).toBe("nvidia.com");
  });

  it("is defensive about empty/malformed domains", () => {
    expect(registrableDomain("")).toBe("");
    expect(registrableDomain(" ")).toBe("");
    expect(registrableDomain("localhost")).toBe("localhost");
    expect(registrableDomain("a.b.c.d")).toBe("c.d");
  });
});

describe("resolveBrandMark", () => {
  it("resolves a known registrable domain to a renderable brand logomark", () => {
    const mark = resolveBrandMark("nvidia.com");
    expect(mark).toBeDefined();
    // React 19 `memo()` returns an object-shaped component, not a plain
    // function — assert it renders an SVG instead of checking `typeof`.
    const Icon = mark!.StatelessIcon;
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("resolves through a sender subdomain", () => {
    const direct = resolveBrandMark("openai.com");
    const sub = resolveBrandMark("updates.openai.com");
    expect(sub).toBe(direct);
  });

  it("is case-insensitive and trims the domain", () => {
    expect(resolveBrandMark("GITHUB.COM")).toBeDefined();
    expect(resolveBrandMark("  nvidia.com  ")).toBeDefined();
  });

  it("returns undefined for unknown or empty domains", () => {
    expect(resolveBrandMark("")).toBeUndefined();
    expect(resolveBrandMark("some-random-startup.xyz")).toBeUndefined();
    expect(resolveBrandMark("gmail.com")).toBeUndefined(); // freemail → avatar/initial chain
    expect(resolveBrandMark(null as unknown as string)).toBeUndefined();
  });

  it("resolves every curated domain in the registry", () => {
    for (const domain of Object.keys(BRAND_LOGOS)) {
      expect(resolveBrandMark(domain), `${domain} should resolve`).toBeDefined();
    }
  });
});