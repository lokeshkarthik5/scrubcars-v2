/**
 * The Detlio seal on the certificate: a rosette ring with the words around
 * it and the wordmark's dot at the centre. Drawn in SVG so it prints crisp;
 * brand red is kept on paper (print-color-adjust), the one mark of colour on
 * an otherwise black-and-white document.
 */
export function CertificateSeal({ size = 96 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="Detlio seal"
      className="shrink-0 text-brand-red [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
    >
      <defs>
        <path id="detlio-seal-ring" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
      </defs>
      {/* Scalloped edge: 24 small bumps around the ring. */}
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2
        return (
          <circle
            key={i}
            cx={60 + Math.cos(angle) * 54}
            cy={60 + Math.sin(angle) * 54}
            r={5.5}
            fill="currentColor"
          />
        )
      })}
      <circle cx="60" cy="60" r="54" fill="currentColor" />
      <circle cx="60" cy="60" r="49" fill="none" stroke="#fff" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="#fff" strokeWidth="1.2" />
      <text fill="#fff" fontSize="9" fontWeight="700" letterSpacing="2.6">
        <textPath href="#detlio-seal-ring" startOffset="0">
          DETLIO · SERVICE HISTORY ·
        </textPath>
      </text>
      <text x="60" y="58" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700" letterSpacing="-0.3">
        Detlio
      </text>
      <text x="60" y="72" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="600" letterSpacing="1.2">
        RECORD
      </text>
    </svg>
  )
}
