import { useEffect, useState } from "react";
import RenderStudioPageLegacy from "./RenderStudioPageLegacy";
import FidelityReviewPanel from "./FidelityReviewPanel";

const RENDER_ID_KEY = "arq_studio_renderId";

export default function RenderStudioPage() {
  const [renderId, setRenderId] = useState(() => sessionStorage.getItem(RENDER_ID_KEY) ?? "");
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const current = sessionStorage.getItem(RENDER_ID_KEY) ?? "";
      setRenderId((previous) => previous === current ? previous : current);
    };
    sync();
    const interval = window.setInterval(sync, 750);
    window.addEventListener("storage", sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!renderId) setReviewOpen(false);
  }, [renderId]);

  return (
    <>
      <RenderStudioPageLegacy />
      {renderId && !reviewOpen && (
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          aria-label="Abrir AI Review de fidelidade"
          style={{
            position: "fixed",
            right: 18,
            bottom: 54,
            zIndex: 1290,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #6D28D9",
            background: "#7C3AED",
            color: "white",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 34px rgba(0,0,0,.35)",
          }}
        >
          ✦ AI Review
        </button>
      )}
      {renderId && reviewOpen && <FidelityReviewPanel renderId={renderId} onClose={() => setReviewOpen(false)} />}
    </>
  );
}
