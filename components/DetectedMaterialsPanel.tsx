import type { DetectedMaterial } from "@/lib/mock-data";
import { safeArray } from "@/lib/utils";

export default function DetectedMaterialsPanel({ materials }: { materials?: unknown }) {
  const safeMaterials = safeArray<DetectedMaterial>(materials);

  return (
    <div className="material-list">
      {safeMaterials.length ? (
        safeMaterials.map((material, index) => (
          <div className="material-row" key={`${material.material_name || "material"}-${material.confidence || 0}-${index}`}>
            <strong>{material.material_name || "Detected material"}</strong>
            <span>{Number(material.confidence || 0)}%</span>
          </div>
        ))
      ) : (
        <div className="material-row">
          <strong>No detected materials</strong>
          <span>0%</span>
        </div>
      )}
    </div>
  );
}
