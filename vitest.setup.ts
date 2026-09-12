import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

const w = dom.window;
globalThis.window = w as unknown as Window & typeof globalThis;
globalThis.document = w.document;
globalThis.DOMParser = w.DOMParser;
globalThis.NodeFilter = w.NodeFilter;
globalThis.NamedNodeMap = w.NamedNodeMap;
globalThis.Node = w.Node;
globalThis.Element = w.Element;
globalThis.HTMLElement = w.HTMLElement;
globalThis.DocumentFragment = w.DocumentFragment;
