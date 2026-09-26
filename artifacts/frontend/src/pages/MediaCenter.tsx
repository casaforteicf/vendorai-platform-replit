import MediaLibraryV2 from "@/pages/MediaLibraryV2";
import MediaLibrarySourceGuide from "@/components/media/MediaLibrarySourceGuide";
import ProductCatalogKnowledgeLibrary from "@/components/media/ProductCatalogKnowledgeLibrary";
import ProductCatalogSelectionBridge from "@/components/media/ProductCatalogSelectionBridge";
import ProductCatalogAiAssistBridge from "@/components/media/ProductCatalogAiAssistBridge";
import ProjectKnowledgeLibrary from "@/components/media/ProjectKnowledgeLibrary";
import InternalProductsKnowledgeLibrary from "@/components/media/InternalProductsKnowledgeLibrary";

export default function MediaCenter() {
  return (
    <>
      <MediaLibrarySourceGuide />
      <ProductCatalogAiAssistBridge />
      <div id="biblioteca-midias">
        <MediaLibraryV2 />
        <ProductCatalogKnowledgeLibrary />
        <ProductCatalogSelectionBridge />
        <ProjectKnowledgeLibrary />
        <InternalProductsKnowledgeLibrary />
      </div>
    </>
  );
}
