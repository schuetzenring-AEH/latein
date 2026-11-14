export function LessonStars({ stars, dim = false }: { stars: readonly boolean[]; dim?: boolean }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {stars.map((lit, index) => (
        <svg key={index} viewBox="0 0 20 20" className="h-3.5 w-3.5">
          <path
            d="M10 1.6 L12.3 7.1 L18.2 7.5 L13.7 11.4 L15.2 17.3 L10 14.2 L4.8 17.3 L6.3 11.4 L1.8 7.5 L7.7 7.1 Z"
            fill={lit ? "#f5b942" : "none"}
            stroke={lit ? "#b45309" : dim ? "#64748b" : "#78716c"}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}
