import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LandingPage } from "@/components/landing/LandingPage";
import "@/styles.css";

const el = document.getElementById("root")!;

createRoot(el).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
);
