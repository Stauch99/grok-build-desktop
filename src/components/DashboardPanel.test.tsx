import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardPanel, type DashboardSession } from "./DashboardPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function session(id: string, status: DashboardSession["status"]): DashboardSession {
  return {
    id,
    title: `Session ${id}`,
    status,
    cwd: `/proj/${id}`,
    agentId: "grok",
    updatedAt: "2026-01-01T00:00:00Z",
    numMessages: 3,
  };
}

function mount(sessions: DashboardSession[], onOpen: (id: string) => void = () => {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(DashboardPanel, { sessions, onOpen }));
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DashboardPanel kanban", () => {
  it("renders all four status columns even when empty", () => {
    mount([session("a", "working")]);
    const cols = [...container.querySelectorAll(".kanban-col")].map((c) =>
      c.getAttribute("data-col"),
    );
    expect(cols).toEqual(["needs-you", "working", "done", "idle"]);
    expect(container.querySelector('[data-col="working"] .kanban-count')?.textContent).toBe("1");
    expect(container.querySelectorAll(".kanban-empty").length).toBe(3);
  });

  it("lands error cards in the needs-you column", () => {
    mount([session("bad", "error"), session("ask", "needs-you")]);
    const col = container.querySelector('[data-col="needs-you"]');
    expect(col?.querySelectorAll(".kanban-card").length).toBe(2);
    expect(col?.querySelector('[data-status="error"]')).toBeTruthy();
  });

  it("puts done-unread sessions in the review column", () => {
    mount([session("x", "done")]);
    expect(
      container.querySelector('[data-col="done"] .kanban-card')?.getAttribute("data-status"),
    ).toBe("done");
  });

  it("opens the session on card click", () => {
    const opened: string[] = [];
    mount([session("s1", "idle")], (id) => opened.push(id));
    const card = container.querySelector<HTMLButtonElement>(".kanban-card");
    act(() => card?.click());
    expect(opened).toEqual(["s1"]);
  });

  it("shows the flat empty state when there are no sessions", () => {
    mount([]);
    expect(container.querySelector(".float-empty")).toBeTruthy();
    expect(container.querySelector(".kanban")).toBeNull();
  });
});
