'use client'

interface Props {
  onClick: () => void
}

export function SubmitFAB({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Submit your entry"
      className="fixed bottom-20 md:bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 font-black uppercase tracking-widest text-black shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
    >
      <span aria-hidden="true" className="text-xl leading-none">+</span>
      <span className="hidden sm:inline text-sm">Submit Entry</span>
    </button>
  )
}
