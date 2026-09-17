import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app/App";
import { BacklogApiProvider, browserApi } from "./app/backlog-api";
import "./styles/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("нет корневого элемента");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <BacklogApiProvider api={browserApi}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BacklogApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
