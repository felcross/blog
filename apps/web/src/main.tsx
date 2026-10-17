import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import { App } from "./App";
import { initWebVitals } from "./shared/vitals";
import { initGlobalErrorHandlers } from "./shared/global-errors";
import "./styles/index.css";

initGlobalErrorHandlers();
initWebVitals();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
