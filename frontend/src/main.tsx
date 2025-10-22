import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./auth"; // Configure Amplify + Hosted UI

createRoot(document.getElementById("root")!).render(<App />);
