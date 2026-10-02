// One section of the listing detail page. The mono English eyebrow (ABOUT,
// POLICIES, …) shows in the English UI only: in Chinese the title stands alone,
// so the page does not mix the two languages (2026-10-02).
export function ListingSection({
  title,
  eyebrow,
  zh,
  children,
}: {
  title: string
  eyebrow?: string
  zh: boolean
  children: React.ReactNode
}) {
  return (
    <div className="mt-10">
      {!zh && eyebrow && (
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {eyebrow}
        </div>
      )}
      <h2 className="mt-1 border-b border-line-divider pb-2 text-[20px] font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </div>
  )
}
