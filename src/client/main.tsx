import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

// Mirror the system theme onto a `.dark` class so shadcn's dark: variants
// fire in sync with the token-level flip in styles.css. Palette colors flip
// via prefers-color-scheme regardless; this just aligns the primitives.
const applyTheme = (dark: boolean) =>
  document.documentElement.classList.toggle("dark", dark);
const mql = window.matchMedia("(prefers-color-scheme: dark)");
applyTheme(mql.matches);
mql.addEventListener("change", (e) => applyTheme(e.matches));

createRoot(document.getElementById("app")!).render(<App />);
