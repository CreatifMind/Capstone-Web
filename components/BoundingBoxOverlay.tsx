type BoundingBoxOverlayProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  status?: "recyclable" | "contaminant";
};

export default function BoundingBoxOverlay({ x, y, width, height, label, status = "recyclable" }: BoundingBoxOverlayProps) {
  return (
    <div
      className={`bbox ${status}`}
      style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }}
    >
      <span>{label}</span>
    </div>
  );
}
