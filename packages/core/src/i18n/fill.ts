import { createElement, Fragment, type ReactNode } from 'react'

/**
 * A translated sentence with markup inside it: the words stay one key, so
 * Tamil can put the bold name where Tamil puts it.
 *
 *   {fill(t('Type {word} to confirm'), { word: <strong>{name}</strong> })}
 *
 * Works on the web and in React Native (inside a Text). A `{name}` with no
 * part given is left as written, as `interpolate` does.
 */
export function fill(
  text: string,
  parts: Readonly<Record<string, ReactNode>>
): ReactNode {
  const pieces = text.split(/\{(\w+)\}/)
  // Odd indexes are the names between the braces.
  return pieces.map((piece, index) => {
    if (index % 2 === 0) return piece
    const part = Object.prototype.hasOwnProperty.call(parts, piece)
      ? parts[piece]
      : `{${piece}}`
    return createElement(Fragment, { key: index }, part)
  })
}
