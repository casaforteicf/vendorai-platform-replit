import GraphicDesignDirectorBasePanel from "./GraphicDesignDirectorBasePanel";
import VisualCompositionIntelligencePanel from "./VisualCompositionIntelligencePanel";
import GraphicDesignIntelligencePanel from "./GraphicDesignIntelligencePanel";
import SmartMediaCanvasAutocomposePanel from "./SmartMediaCanvasAutocomposePanel";

export default function GraphicDesignDirectorPanel() {
  return (
    <div className="space-y-5">
      <GraphicDesignDirectorBasePanel />
      <VisualCompositionIntelligencePanel />
      <GraphicDesignIntelligencePanel />
      <SmartMediaCanvasAutocomposePanel />
    </div>
  );
}
