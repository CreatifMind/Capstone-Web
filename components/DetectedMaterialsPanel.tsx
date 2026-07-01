import type { DetectedMaterial } from "@/lib/mock-data";

export default function DetectedMaterialsPanel({ materials }: { materials: DetectedMaterial[] }) {
  return (
    <div className="material-list">
      {materials.map(material => (
        <div className="material-row" key={`${material.material_name}-${material.confidence}`}>
          <strong>{material.material_name}</strong>
          <span>{material.confidence}%</span>
        </div>
      ))}
    </div>
  );
}
