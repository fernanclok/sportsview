import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TvApp } from "./TvApp";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./styles.css";

// macOS draws the traffic lights over the content; elsewhere the window has a native frame.
document.documentElement.dataset.platform = /Mac/.test(navigator.platform) ? "mac" : "other";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.hash === "#tv" ? <TvApp /> : <App />}
  </StrictMode>,
);
