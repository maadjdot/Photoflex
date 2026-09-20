import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createBrowserDependencies } from "./app/dependencies";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

const reactRoot = createRoot(root);

if (import.meta.env.DEV && window.location.pathname === "/prototype/layout") {
  void import("./app/LayoutPrototype").then(({ LayoutPrototype }) => {
    reactRoot.render(<StrictMode><LayoutPrototype /></StrictMode>);
  });
} else {
  reactRoot.render(
    <StrictMode>
      <App dependencies={createBrowserDependencies()} />
    </StrictMode>,
  );
}
