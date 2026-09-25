import { z } from "zod";

z.config({ jitless: true });
// CSP forbids eval: every module that builds zod schemas loads only after the line above.
void import("./start").then(({ startApp }) => startApp());
