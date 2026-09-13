import GraphicDesignDirectorBasePanel from "./GraphicDesignDirectorBasePanel";
import MediaIntelligenceIndexPanel from "./MediaIntelligenceIndexPanel";
import VisualCompositionIntelligencePanel from "./VisualCompositionIntelligencePanel";
import GraphicDesignIntelligencePanel from "./GraphicDesignIntelligencePanel";
import SmartMediaCanvasAutocomposeGate from "./SmartMediaCanvasAutocomposeGate";
import SmartStoryboardComposerPanel from "./SmartStoryboardComposerPanel";

export default function GraphicDesignDirectorPanel() {
  return (
    <div className="space-y-5">
      <GraphicDesignDirectorBasePanel />
      <MediaIntelligenceIndexPanel />
      <VisualCompositionIntelligencePanel />
      <GraphicDesignIntelligencePanel />
      <SmartMediaCanvasAutocomposeGate />
      <SmartStoryboardComposerPanel />
    </div>
  );
}
