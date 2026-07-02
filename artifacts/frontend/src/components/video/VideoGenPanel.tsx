import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Settings2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VideoTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
}

export interface VideoGenPanelProps {
  title: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  tabs: VideoTab[];
  rightPanel: React.ReactNode;
  voices?: VoiceOption[];
  voice?: string;
  onVoiceChange?: (v: string) => void;
  quality?: "720p" | "1080p";
  onQualityChange?: (q: "720p" | "1080p") => void;
  onGenerate: (activeTabId: string) => void;
  generating?: boolean;
  generateLabel?: string;
  generateDisabled?: boolean;
  backPath?: string;
  onTabChange?: (tabId: string) => void;
}

const QUALITY_OPTIONS = ["720p", "1080p"] as const;

export default function VideoGenPanel({
  title,
  description,
  icon: Icon,
  iconBg,
  tabs,
  rightPanel,
  voices = [],
  voice,
  onVoiceChange,
  quality = "720p",
  onQualityChange,
  onGenerate,
  generating = false,
  generateLabel = "Gerar vídeo",
  generateDisabled = false,
  backPath = "/content-studio/video",
  onTabChange,
}: VideoGenPanelProps) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);

  const selectedVoice = voices.find((v) => v.id === voice) ?? voices[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8] flex flex-col">
      <div className="max-w-5xl mx-auto px-4 py-6 w-full flex flex-col gap-5 flex-1">

        {/* Back + Header */}
        <div>
          <button
            onClick={() => navigate(backPath)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", iconBg)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white">{title}</h1>
              <p className="text-sm text-gray-400">{description}</p>
            </div>
          </div>
        </div>

        {/* Dual panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">

          {/* Left: tabs + input */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {/* Tab bar */}
            {tabs.length > 1 && (
              <div className="flex border-b border-white/10">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); onTabChange?.(tab.id); }}
                    className={cn(
                      "flex-1 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px",
                      activeTab === tab.id
                        ? "border-purple-500 text-purple-300"
                        : "border-transparent text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Tab content */}
            <div className="flex-1 p-4">
              {tabs.find((t) => t.id === activeTab)?.content}
            </div>
          </div>

          {/* Right: upload / preview */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="flex-1 p-4">
              {rightPanel}
            </div>
          </div>
        </div>

        {/* Fixed action bar */}
        <div className="sticky bottom-0 -mx-4 px-4 pb-4 pt-3 bg-gradient-to-t from-[#0a0818] via-[#0a0818]/95 to-transparent">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#12092a] px-4 py-3">

            {/* Voice selector */}
            {voices.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setVoiceOpen((v) => !v); setQualityOpen(false); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-gray-300 hover:border-white/20 transition-colors whitespace-nowrap"
                >
                  🎙 {selectedVoice?.label ?? "Voz"}
                  <ChevronDown className="h-3 w-3 text-gray-500" />
                </button>
                {voiceOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-white/15 bg-[#1a1040] shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
                    {voices.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => { onVoiceChange?.(v.id); setVoiceOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs transition-colors",
                          voice === v.id
                            ? "text-purple-300 bg-purple-500/10"
                            : "text-gray-300 hover:bg-white/5"
                        )}
                      >
                        <span className="font-medium">{v.label}</span>
                        <span className="ml-1.5 text-gray-500">{v.lang}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality selector */}
            <div className="relative">
              <button
                onClick={() => { setQualityOpen((v) => !v); setVoiceOpen(false); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-gray-300 hover:border-white/20 transition-colors"
              >
                {quality} <ChevronDown className="h-3 w-3 text-gray-500" />
              </button>
              {qualityOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-24 rounded-xl border border-white/15 bg-[#1a1040] shadow-xl z-50 py-1">
                  {QUALITY_OPTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => { onQualityChange?.(q); setQualityOpen(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs transition-colors",
                        quality === q
                          ? "text-purple-300 bg-purple-500/10"
                          : "text-gray-300 hover:bg-white/5"
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Settings icon (placeholder) */}
            <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20 transition-colors">
              <Settings2 className="h-4 w-4" />
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Generate button */}
            <button
              onClick={() => onGenerate(activeTab)}
              disabled={generateDisabled || generating}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all",
                generateDisabled || generating
                  ? "bg-purple-900/40 text-purple-400/50 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90 shadow-lg shadow-purple-900/30"
              )}
            >
              {generating ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Gerando…
                </>
              ) : (
                <>✨ {generateLabel}</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
