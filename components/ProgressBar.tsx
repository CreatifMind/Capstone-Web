import type { CSSProperties } from "react";

type ProgressBarProps = {
  value: number;
  label?: string;
};

type ProgressStyle = CSSProperties & {
  "--target-width"?: string;
};

export default function ProgressBar({ value, label }: ProgressBarProps) {
  const progressStyle: ProgressStyle = {
    width: `${value}%`,
    "--target-width": `${value}%`
  };

  return (
    <div className="kpi-progress">
      {label ? <span>{label}</span> : null}
      <div className="kpi-progress-bar">
        <i style={progressStyle} />
      </div>
    </div>
  );
}
