import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./app/App";
import { BacklogApiProvider, browserApi } from "./app/backlog-api";
import { LanguageLoader } from "./app/LanguageLoader";
import { createQueryClient } from "./app/query-client";
import "./styles/base.css";

export function startApp(): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("root element is missing");

  const router = createBrowserRouter(routes);

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <BacklogApiProvider api={browserApi}>
          <LanguageLoader>
            <RouterProvider router={router} />
          </LanguageLoader>
        </BacklogApiProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
