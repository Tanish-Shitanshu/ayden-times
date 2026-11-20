import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "@fontsource-variable/google-sans-flex";
import "@fontsource-variable/google-sans-code";
import "./design/fonts.css";
import "./design/tokens.css";
import "./design/base.css";
import "./app/shell.css";
import { router } from "./app/routes";
import { useApp } from "./app/store";

document.documentElement.lang = useApp.getState().lang;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
