import { createContext } from "react";

// Provides the currently-selected months (array of "YYYY-MM") to analytics pages
// so /api/analytics can re-slice server-side. null = no filter (full year).
export const PeriodContext = createContext(null);
