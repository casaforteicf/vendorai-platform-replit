import React from "react";

type SearchLibraryProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SearchLibrary({
  value,
  onChange,
  placeholder = "Buscar materiais, móveis ou fabricantes...",
}: SearchLibraryProps) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
      />
    </div>
  );
}
