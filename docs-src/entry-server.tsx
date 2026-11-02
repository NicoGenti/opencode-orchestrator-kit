import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

import { LandingPage } from "@/components/landing/LandingPage";

export function render(): string {
  return renderToString(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  );
}
