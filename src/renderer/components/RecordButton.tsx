type RecordingState = "idle" | "recording" | "stopping" | "error";

interface RecordButtonProps {
  state: RecordingState;
  onClick: () => void;
  size?: "default" | "large";
}

const config: Record<
  RecordingState,
  { label: string; bg: string; ring: string; animate: boolean }
> = {
  idle: {
    label: "Start Recording",
    bg: "bg-blue-600 hover:bg-blue-500",
    ring: "ring-blue-400/30",
    animate: false,
  },
  recording: {
    label: "Stop Recording",
    bg: "bg-red-600 hover:bg-red-500",
    ring: "ring-red-400/30",
    animate: true,
  },
  stopping: {
    label: "Stopping...",
    bg: "bg-gray-600",
    ring: "ring-gray-400/30",
    animate: false,
  },
  error: {
    label: "Retry",
    bg: "bg-amber-600 hover:bg-amber-500",
    ring: "ring-amber-400/30",
    animate: false,
  },
};

export default function RecordButton({
  state,
  onClick,
  size = "default",
}: RecordButtonProps) {
  const c = config[state];
  const disabled = state === "stopping";
  const isLarge = size === "large";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex shrink-0 items-center justify-center rounded-full ring-2 ${c.bg} ${c.ring} text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        isLarge ? "h-16 w-16" : "h-10 w-10"
      }`}
    >
      {c.animate && (
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-25" />
      )}
      {state === "recording" ? (
        <span
          className={`rounded-sm bg-white ${isLarge ? "h-5 w-5" : "h-3.5 w-3.5"}`}
        />
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={isLarge ? "h-7 w-7" : "h-5 w-5"}
        >
          <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
          <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
        </svg>
      )}
      <span className="sr-only">{c.label}</span>
    </button>
  );
}
