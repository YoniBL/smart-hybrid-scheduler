import React from "react";

export type Toast = { id: number; kind: "success" | "error" | "info"; msg: string; };
type Ctx = {
  toasts: Toast[];
  show: (kind: Toast["kind"], msg: string) => void;
  remove: (id: number) => void;
};

const ToastCtx = React.createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const idRef = React.useRef(1);

  const show = React.useCallback((kind: Toast["kind"], msg: string) => {
    const id = idRef.current++;
    setToasts(t => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);

  const remove = React.useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toasts, show, remove }), [toasts, show, remove]);
  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>;
}

export function useToasts() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToasts must be used within <ToastProvider>");
  return ctx;
}

export function Toaster() {
  const { toasts, remove } = useToasts();
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, display: "flex", flexDirection: "column",
      gap: 8, zIndex: 1000
    }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)}
          style={{
            minWidth: 220, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
            color: "white",
            background: t.kind === "success" ? "#16a34a" : t.kind === "error" ? "#dc2626" : "#2563eb",
            boxShadow: "0 6px 18px rgba(0,0,0,.2)"
          }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
