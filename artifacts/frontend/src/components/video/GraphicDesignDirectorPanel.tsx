import GraphicDesignDirectorBasePanel from "./GraphicDesignDirectorBasePanel";
import VisualCompositionIntelligencePanel from "./VisualCompositionIntelligencePanel";
import GraphicDesignIntelligencePanel from "./GraphicDesignIntelligencePanel";
import SmartMediaCanvasAutocomposeGate from "./SmartMediaCanvasAutocomposeGate";
import SmartStoryboardComposerPanel from "./SmartStoryboardComposerPanel";

export default function GraphicDesignDirectorPanel() {
  return (
    <div className="space-y-5">
      <GraphicDesignDirectorBasePanel />
      <VisualCompositionIntelligencePanel />
      <GraphicDesignIntelligencePanel />
      <SmartMediaCanvasAutocomposeGate />
      <SmartStoryboardComposerPanel />
    </div>
  );
}
