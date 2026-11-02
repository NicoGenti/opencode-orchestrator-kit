import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { LandingPage } from "@/components/landing/LandingPage";
import "@/styles.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("Missing #root");
}

const app = (
  <StrictMode>
    <LandingPage />
  </StrictMode>
);

if (el.childElementCount > 0) {
  hydrateRoot(el, app);
} else {
  createRoot(el).render(app);
}
