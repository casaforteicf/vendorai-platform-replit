import { ShieldCheck } from "lucide-react";
import VideoAudioStudioPanel from "@/components/video/VideoAudioStudioPanel";
import CreativeFontToolbar from "@/components/video/CreativeFontToolbar";
import ProfessionalGraphicCanvasEditorV2 from "@/components/video/ProfessionalGraphicCanvasEditorV2";
import ProfessionalGraphicFinalRenderPanel from "@/components/video/ProfessionalGraphicFinalRenderPanel";
import ProfessionalGraphicRenderVersionLinker from "@/components/video/ProfessionalGraphicRenderVersionLinker";
import SmartStoryboardMasterComposerPanel from "@/components/video/SmartStoryboardMasterComposerPanel";
import SmartStoryboardNavigator from "@/components/video/SmartStoryboardNavigator";
import VideoTimelineEditor from "@/components/video/VideoTimelineEditor";

export default function VideoEdicaoPage() {
  return (
    <div className="space-y-5">
      <SmartStoryboardNavigator />
      <SmartStoryboardMasterComposerPanel />
      <ProfessionalGraphicRenderVersionLinker />
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /></div>
          <div>
            <p className="font-semibold text-foreground">Edição e finalização profissional</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Finalize design, layout, áudio, locução, música, efeitos, textos, legendas, cortes e timeline sem alterar o original. O resultado é salvo como uma nova versão na Biblioteca.</p>
          </div>
        </div>
      </section>
      <ProfessionalGraphicCanvasEditorV2 />
      <ProfessionalGraphicFinalRenderPanel />
      <VideoAudioStudioPanel />
      <CreativeFontToolbar />
      <div data-video-font-scope>
        <VideoTimelineEditor />
      </div>
    </div>
  );
}
