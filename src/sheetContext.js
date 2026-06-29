import { createContext } from "react";

// The active Google Sheet URL, provided at the app root and read by the data hooks
// so every request is stateless and self-contained (no server-side config).
export const SheetContext = createContext("");
