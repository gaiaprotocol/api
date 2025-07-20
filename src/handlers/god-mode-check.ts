import { z } from 'zod'
import { checkGodMode } from '../services/god-mode'

export async function handleGodModeCheck(request: Request): Promise<Response> {
  const schema = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  })

  const { address } = schema.parse(await request.json())

  const godMode = await checkGodMode(address)

  return Response.json({ godMode })
}
