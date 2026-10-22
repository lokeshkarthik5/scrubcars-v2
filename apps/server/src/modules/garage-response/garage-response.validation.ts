import { z } from 'zod'

export const otherGaragesParamSchema = z.object({
  id: z.uuid(),
})

export type OtherGaragesParam = z.infer<typeof otherGaragesParamSchema>
