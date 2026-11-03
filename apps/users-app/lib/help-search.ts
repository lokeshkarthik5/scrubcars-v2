/**
 * The Help centre's search: which questions match what the customer typed.
 * Pure, so the rule is unit-tested (help-search.test.ts).
 *
 * Every word typed must appear somewhere in the question, its answer or its
 * group's title, in any order, ignoring case and punctuation. A word matches
 * the start of a word in the text, so "refun" finds "refund" and "refunds"
 * but "fun" does not. An empty search shows everything.
 */
export interface SearchableQuestion {
  q: string
  a: string[]
}

export interface SearchableGroup<Q extends SearchableQuestion> {
  title: string
  questions: Q[]
}

/** Lower case, letters and digits only, one space between words. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

export function searchHelp<Q extends SearchableQuestion, G extends SearchableGroup<Q>>(
  groups: G[],
  query: string
): G[] {
  const wanted = words(query)
  if (wanted.length === 0) return groups
  return groups
    .map((group) => ({
      ...group,
      questions: group.questions.filter((question) => {
        const haystack = words([group.title, question.q, ...question.a].join(' '))
        return wanted.every((word) => haystack.some((candidate) => candidate.startsWith(word)))
      }),
    }))
    .filter((group) => group.questions.length > 0)
}

/** How many questions a search left, for the screen reader's line. */
export function countQuestions(groups: Array<{ questions: unknown[] }>): number {
  return groups.reduce((total, group) => total + group.questions.length, 0)
}
