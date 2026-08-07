/** The circle mark. Colour comes from `currentColor`, set by the class. */
export function Ring({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth={5} />
    </svg>
  );
}
