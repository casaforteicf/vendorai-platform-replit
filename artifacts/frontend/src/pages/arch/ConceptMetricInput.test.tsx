// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConceptMetricInput } from "./ConceptMetricInput";
afterEach(cleanup);
it("descarta a medida inválida ao selecionar outro elemento com o mesmo valor", () => {
  const commit = vi.fn();
  const view = render(<ConceptMetricInput selectionId="a" value={0.9} min={0.5} max={4} onCommit={commit} />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.blur(input);
  expect(screen.getByRole("alert").textContent).toContain("4,00");
  view.rerender(<ConceptMetricInput selectionId="b" value={0.9} min={0.5} max={4} onCommit={commit} />);
  expect((input as HTMLInputElement).value).toBe("0,90");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(commit).not.toHaveBeenCalled();
});
it("preserva a digitação e confirma medida com vírgula ao sair", () => {
  const commit = vi.fn();
  render(<ConceptMetricInput value={0.9} min={0.5} max={4} onCommit={commit} />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "" } });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "1,23" } });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledWith(1.23);
});
it("rejeita valor fora dos limites e restaura com Escape", () => {
  const commit = vi.fn();
  render(<ConceptMetricInput value={0.9} min={0.5} max={4} onCommit={commit} />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.blur(input);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Escape" });
  expect((input as HTMLInputElement).value).toBe("0,90");
});
