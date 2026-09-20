import { motion, useReducedMotion } from 'motion/react';

const metrics = [
  { value: '1,431', label: 'Followers', tone: 'bg-[#f7f7fa] text-[#12131a]' },
  { value: '616', label: 'Following', tone: 'bg-[#f7f7fa] text-[#12131a]' },
  { value: '603', label: 'Mutual', tone: 'bg-[#eef9f1] text-[#248a4b]' },
  { value: '13', label: "Don't follow you back", tone: 'bg-[#fff1f2] text-[#e23943]' },
  { value: '828', label: "You don't follow back", tone: 'bg-[#fff7e8] text-[#d97706]' },
];

export function ProductPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-[410px]"
    >
      <div className="rounded-[28px] border border-[#e8e9ef] bg-[#f7f7fb] p-3 shadow-[0_24px_70px_rgba(20,22,38,0.12)]">
        <div className="overflow-hidden rounded-[21px] border border-[#e8e9ef] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8e9ef] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-[#17143f] text-white">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                  <path d="M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-1a3 3 0 1 0 0-6M4 19c0-3.04 2.46-5.5 5.5-5.5S15 15.96 15 19m2-5.5c2.76 0 5 2.24 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-[17px] font-semibold tracking-[-0.025em]">WhoBack</span>
            </div>
            <span className="grid size-8 place-items-center rounded-lg border border-[#e8e9ef] text-[#727586]">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7"/>
              </svg>
            </span>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-[#17143f] text-xs font-semibold text-white">Y</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">@youraccount</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#727586]">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Connected
                </div>
              </div>
              <div className="grid size-8 place-items-center rounded-lg border border-[#e8e9ef] text-[#727586]">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                  <path d="M4 4v6h6M20 20v-6h-6M5.2 15A7 7 0 0 0 18 17m.8-8A7 7 0 0 0 6 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <motion.div
              initial={reduceMotion ? false : 'hidden'}
              animate={reduceMotion ? undefined : 'show'}
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.06, delayChildren: 0.18 } },
              }}
              className="mt-4 grid grid-cols-2 gap-2"
            >
              {metrics.map((metric) => (
                <motion.div
                  key={metric.label}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.3 }}
                  className={`rounded-xl p-3 ${metric.tone}`}
                >
                  <div className="text-xl font-semibold tracking-[-0.03em] tabular-nums">{metric.value}</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-tight opacity-80">{metric.label}</div>
                </motion.div>
              ))}
            </motion.div>

            <div className="mt-4 flex h-11 items-center justify-center rounded-xl bg-[#17143f] text-sm font-semibold text-white">
              View details
              <svg viewBox="0 0 20 20" className="ml-2 size-4" fill="none" aria-hidden="true">
                <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="mt-3 text-center text-[10px] text-[#727586]">Product preview</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
