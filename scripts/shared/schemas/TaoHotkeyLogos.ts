import z from 'zod/v4'

/** maps a bittensor delegate hotkey to the name of its logo file, relative to the hotkeys assets folder */
export const TaoHotkeyLogosFileSchema = z.record(z.string().nonempty(), z.string().nonempty())

export type TaoHotkeyLogos = z.infer<typeof TaoHotkeyLogosFileSchema>
