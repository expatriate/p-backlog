import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./app/App";
import { BacklogApiProvider, browserApi } from "./app/backlog-api";
import { LanguageLoader } from "./app/LanguageLoader";
import "./styles/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("root element is missing");

const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <BacklogApiProvider api={browserApi}>
        <LanguageLoader>
          <RouterProvider router={router} />
        </LanguageLoader>
      </BacklogApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
