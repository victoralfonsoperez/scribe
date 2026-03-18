interface AudioLevelMeterProps {
  level: number; // 0.0 – 1.0 (RMS)
}

const SEGMENT_COUNT = 20;

function segmentColor(index: number): string {
  if (index < 14) return "bg-green-500";
  if (index < 17) return "bg-yellow-500";
  return "bg-red-500";
}

export default function AudioLevelMeter({ level }: AudioLevelMeterProps) {
  // Map RMS (typically 0–0.5 range) to 0–1 for display
  const normalized = Math.min(level * 2, 1);
  const activeCount = Math.round(normalized * SEGMENT_COUNT);

  return (
    <div
      className="flex h-4 items-end gap-0.5"
      role="meter"
      aria-label="Audio input level"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(level * 100) / 100}
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const isActive = i < activeCount;
        // Progressive height: taller segments toward the right
        const heightPercent = 40 + (i / (SEGMENT_COUNT - 1)) * 60;

        return (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-opacity duration-75 ${
              isActive ? segmentColor(i) : "bg-bg-active"
            }`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}
