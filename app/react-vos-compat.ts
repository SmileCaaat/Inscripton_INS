import * as ReactDOM from "react-dom";
import ReactDOMDefault from "react-dom";

function findDOMNode(component: unknown): Element | Text | null {
  if (component == null) return null;
  if (component instanceof Element || component instanceof Text) return component;
  return null;
}

for (const target of [ReactDOM, ReactDOMDefault]) {
  if (!target || typeof (target as { findDOMNode?: unknown }).findDOMNode === "function") {
    continue;
  }
  try {
    (target as unknown as { findDOMNode: typeof findDOMNode }).findDOMNode = findDOMNode;
  } catch {
    Object.defineProperty(target, "findDOMNode", {
      configurable: true,
      value: findDOMNode,
    });
  }
}
