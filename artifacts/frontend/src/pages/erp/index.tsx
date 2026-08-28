import { useRef, useState, type ChangeEvent } from "react";

interface ProcessResult {
  type: string;
  value: string;
}

export default function PlannedERP() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function processDocument() {
    if (!preview) return;
    setResult({ type: "Nota Fiscal", value: "R$ 157,80" });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📊 Gestão ERP</h1>

      <div className="bg-white rounded shadow p-6 mb-6 border">
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <input ref={uploadInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />

        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => cameraInputRef.current?.click()} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">📷 Fotografar</button>
          <button type="button" onClick={() => uploadInputRef.current?.click()} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">📤 Upload</button>
        </div>

        {preview && (
          <div className="mt-4">
            <img src={preview} alt="Preview do documento" className="max-h-64 rounded border object-contain" />
            <button type="button" onClick={processDocument} className="mt-3 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">🚀 Processar</button>
          </div>
        )}
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded p-6">
          <h3 className="font-bold text-green-800">✅ Processado</h3>
          <p>Tipo: {result.type}</p>
          <p>Valor: {result.value}</p>
        </div>
      )}
    </div>
  );
}
