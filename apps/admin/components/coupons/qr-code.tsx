import qrcode from 'qrcode-generator'

/**
 * A QR code as an SVG drawn from the code's own modules: no image file, no
 * canvas and nothing from the network, so it prints sharp at any size. Black
 * on white with the standard 4-module quiet zone, error correction M
 * (survives a crease or a smudge on paper). The customer app's certificate
 * draws its QR the same way, with the same pinned qrcode-generator.
 */
export function QrCode({ value, size, label }: { value: string; size: string | number; label: string }) {
  const code = qrcode(0, 'M')
  code.addData(value)
  code.make()
  const count = code.getModuleCount()
  const quiet = 4
  const total = count + quiet * 2

  let path = ''
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`
    }
  }

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      style={{ flexShrink: 0 }}
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
