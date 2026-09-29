import { createElement } from "react";
import { createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree";

const hashHistory = createHashHistory();

export const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPreload: false,
  defaultErrorComponent: ({ error }) =>
    createElement(
      "div",
      { className: "flex h-full flex-col items-center justify-center p-8 text-center" },
      createElement("p", { className: "mb-1 text-sm font-medium" }, "Something went wrong"),
      createElement(
        "p",
        { className: "text-xs text-text-tertiary" },
        error instanceof Error ? error.message : "An unexpected error occurred",
      ),
    ),
});

// Type-safe router module augmentation
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
