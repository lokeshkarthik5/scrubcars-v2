/**
 * The pure parts of the native repair-quote screens (0075), as the web's page says them:
 * what the picker's type means, the car's short name, which step blocks Next, and which
 * picture carries the box. Kept apart from the screens so they are tested on their own.
 */

/** The video types the API takes, from what the picker says (an iPhone's .mov is QuickTime). */
export function videoTypeOf(mimeType: string | null | undefined, uri: string): string {
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime' || mimeType === 'video/webm') return mimeType;
  if (/\.mov$/i.test(uri)) return 'video/quicktime';
  if (/\.webm$/i.test(uri)) return 'video/webm';
  return 'video/mp4';
}

/** "3 quotes for your Swift": the model, from the label the request kept ("Maruti Swift"). */
export function carShortName(label: string): string {
  return label.split(' ').slice(1).join(' ') || label;
}

/** Why Next can't be pressed yet (English, shown through `t`), or null. */
export function stepOneProblem(input: { hasCar: boolean; hasMedia: boolean; note: string; hasPlace: boolean }): string | null {
  if (!input.hasCar) return 'Add your car first';
  if (!input.hasMedia) return 'Add a video or a photo of the damage';
  if (!input.note.trim()) return 'Say what happened in a line';
  if (!input.hasPlace) return 'Choose where the car is';
  return null;
}

/** How the brief came to be: the AI's as written, the AI's edited, or the customer's own. */
export function briefSource(aiText: string | null, text: string): 'ai' | 'ai_edited' | 'customer' {
  if (aiText === null) return 'customer';
  return text.trim() === aiText ? 'ai' : 'ai_edited';
}

/** The AI's box, kept only on a picture that was sent. */
export function keptBox<B extends { image: number }>(box: B | null | undefined, sent: number): B | null {
  return box && box.image < sent ? box : null;
}
