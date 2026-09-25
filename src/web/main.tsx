import { z } from "zod";
import { appEn } from "./app/messages.en";
import { appRu } from "./app/messages.ru";

z.config({ jitless: true });
// CSP forbids eval: every module that builds zod schemas loads only after the line above.
void import("./start")
  .then(({ startApp }) => startApp())
  .catch(showLoadFailure);

function showLoadFailure(): void {
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = `${appRu.bootLoadError} · ${appEn.bootLoadError}`;
  (document.getElementById("root") ?? document.body).replaceChildren(message);
}
