import GraphicDesignDirectorBasePanel from "./GraphicDesignDirectorBasePanel";
import GraphicDesignIntelligencePanel from "./GraphicDesignIntelligencePanel";

export default function GraphicDesignDirectorPanel() {
  return (
    <div className="space-y-5">
      <GraphicDesignDirectorBasePanel />
      <GraphicDesignIntelligencePanel />
    </div>
  );
}
