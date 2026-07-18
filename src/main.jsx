import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { BRAND_NAME } from "../shared/brand.js";

document.title = `${BRAND_NAME} - Live MIS Dashboard`;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
