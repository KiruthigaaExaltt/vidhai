import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { PwaProvider } from "./pwa/PwaProvider";

createRoot(document.getElementById("root")!).render(<PwaProvider><App /></PwaProvider>);
