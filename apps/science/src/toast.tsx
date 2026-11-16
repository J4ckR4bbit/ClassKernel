import { create } from "zustand";

// A short message at the foot of the screen ("Saved galvanic_cell_zn_cu.png").

const useToast = create<{ message: string | null }>(() => ({ message: null }));
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string): void {
  useToast.setState({ message });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => useToast.setState({ message: null }), 2500);
}

/** Always there, so a screen reader reads each message as it appears. */
export function Toasts() {
  const message = useToast((s) => s.message);
  return (
    <div className="live-region" role="status">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
