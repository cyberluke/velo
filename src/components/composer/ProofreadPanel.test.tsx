import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProofreadPanel } from "./ProofreadPanel";
import type { ProofreadResult } from "@/services/ai/types";

describe("ProofreadPanel", () => {
  it("shows a loading state while reviewing", () => {
    render(<ProofreadPanel result={null} isLoading onConfirmSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("Reviewing your email...")).toBeInTheDocument();
  });

  it("shows a success state when the email has no issues", () => {
    const result: ProofreadResult = { issues: [], overallScore: "good" };
    render(<ProofreadPanel result={result} isLoading={false} onConfirmSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("Looks good!")).toBeInTheDocument();
  });

  it("lists issues with severity labels", () => {
    const result: ProofreadResult = {
      issues: [
        { type: "tone", description: "This sounds aggressive.", severity: "warning" },
        { type: "clarity", description: "The deadline is unclear.", severity: "error" },
      ],
      overallScore: "caution",
    };
    render(<ProofreadPanel result={result} isLoading={false} onConfirmSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("This sounds aggressive.")).toBeInTheDocument();
    expect(screen.getByText("The deadline is unclear.")).toBeInTheDocument();
    expect(screen.getByText("2 issue(s) found. Review before sending.")).toBeInTheDocument();
  });

  it("calls onConfirmSend when Send anyway is clicked", () => {
    const onConfirmSend = vi.fn();
    const result: ProofreadResult = {
      issues: [{ type: "other", description: "Double-check the date.", severity: "info" }],
      overallScore: "caution",
    };
    render(<ProofreadPanel result={result} isLoading={false} onConfirmSend={onConfirmSend} onCancel={() => {}} />);
    fireEvent.click(screen.getByText("Send anyway"));
    expect(onConfirmSend).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Go back to edit is clicked", () => {
    const onCancel = vi.fn();
    const result: ProofreadResult = { issues: [], overallScore: "good" };
    render(<ProofreadPanel result={result} isLoading={false} onConfirmSend={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Go back to edit"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});