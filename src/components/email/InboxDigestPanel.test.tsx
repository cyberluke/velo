import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InboxDigestPanel } from "./InboxDigestPanel";

describe("InboxDigestPanel", () => {
  it("shows a loading state while summarizing", () => {
    render(<InboxDigestPanel content={null} isLoading onClose={() => {}} />);
    expect(screen.getByText("Summarizing your inbox...")).toBeInTheDocument();
  });

  it("renders the digest content", () => {
    render(<InboxDigestPanel content={"• Alice: project update — needs sign-off"} isLoading={false} onClose={() => {}} />);
    expect(screen.getByText("• Alice: project update — needs sign-off")).toBeInTheDocument();
  });

  it("shows an empty state when no content is available", () => {
    render(<InboxDigestPanel content={null} isLoading={false} onClose={() => {}} />);
    expect(screen.getByText(/No digest available/)).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<InboxDigestPanel content={"digest"} isLoading={false} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close inbox digest"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});