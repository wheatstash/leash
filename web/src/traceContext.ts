import { createContext, useContext } from "react";

/** Opens the call trace inspector for an audit entry, from anywhere in the console. */
export const TraceContext = createContext<(auditId: string) => void>(() => {});
export const useOpenTrace = () => useContext(TraceContext);
