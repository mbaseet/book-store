type MintPose = 'wave' | 'exploring' | 'happy' | 'loves' | 'peek' | 'reading' | 'sleeping' | 'surprised' | 'plays'

const poseSources: Record<MintPose, string> = {
  wave: '/brand/mint-wave.png',
  exploring: '/brand/mint-exploring.png',
  happy: '/brand/mint-happy.png',
  loves: '/brand/mint-loves.png',
  peek: '/brand/mint-peek.png',
  reading: '/brand/mint-reading.png',
  sleeping: '/brand/mint-sleeping.png',
  surprised: '/brand/mint-surprised.png',
  plays: '/brand/mint-plays.png',
}

type MintCompanionProps = {
  pose?: MintPose
  message: string
  eyebrow?: string
  className?: string
  imageClassName?: string
  tone?: 'cream' | 'mint' | 'sunshine'
}

export function MintCompanion({
  pose = 'wave',
  message,
  eyebrow,
  className = '',
  imageClassName = '',
  tone = 'cream',
}: MintCompanionProps) {
  const tones = {
    cream: 'bg-[#FAF8F3] text-[#075f5b] ring-[#0D7D78]/10',
    mint: 'bg-[#0D7D78] text-[#FAF8F3] ring-[#9FD9C2]/35',
    sunshine: 'bg-[#FFD14D] text-[#075f5b] ring-[#FFD14D]',
  }

  return (
    <aside className={`relative flex min-h-28 items-center overflow-hidden rounded-[1.65rem] p-4 shadow-[0_12px_30px_rgba(7,95,91,.1)] ring-1 ${tones[tone]} ${className}`}>
      <img src={poseSources[pose]} alt="" aria-hidden="true" className={`pointer-events-none -ms-2 h-28 w-24 shrink-0 object-contain ${imageClassName}`} />
      <div className="relative min-w-0 pe-1">
        {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[.13em] opacity-70">{eyebrow}</p> : null}
        <p className="mt-1 text-sm font-black leading-5">{message}</p>
      </div>
    </aside>
  )
}
