import React from "react";
import "../../src/App.css";
import "../../src/index.css";
import { createRoot } from "react-dom/client";
import ESSMarkupPage from "../../src/components/ESSMarkupPage";
const root = createRoot(document.getElementById("root"));
const draft = {};
window.showMarkup = (show) => root.render(show ? <ESSMarkupPage draft={draft} /> : <div>Another app page</div>);
if (import.meta.env.DEV) window.showMarkup(true);
