'use client'

interface Props {
  onClick: () => void
}

export function SubmitFAB({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label="Submit your entry"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 font-black uppercase tracking-widest text-black shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-colors"
    >
      <span aria-hidden="true" className="text-xl leading-none">+</span>
      <span className="hidden sm:inline text-sm">Submit Entry</span>
    </button>
  )
}
