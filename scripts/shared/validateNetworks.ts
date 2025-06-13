import z from 'zod/v4'

type AnyNetwork = { id: string }

export const validateNetwork = (network: AnyNetwork, networkSchema: z.ZodType<any>) => {
  const parsable = networkSchema.safeParse(network)
  if (!parsable.success) {
    console.error(parsable.error.message, { issues: parsable.error.issues, network })
    throw new Error(`Failed to parse network "${network.id}"`)
  }
}

export const validateNetworks = (networks: AnyNetwork[], networkSchema: z.ZodType<any>) => {
  for (const network of networks) validateNetwork(network, networkSchema)
}
