import { UsersIcon } from './icons';

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5">
    <div className="grid size-9 place-items-center rounded-xl bg-[#17143f] text-white shadow-sm"><UsersIcon className="size-5" /></div>
    {!compact && <span className="text-[17px] font-semibold tracking-[-0.02em]">WhoBack</span>}
  </div>;
}
