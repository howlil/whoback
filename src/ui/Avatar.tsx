export function Avatar({ username, src, size = 'md' }: { username: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-14 text-lg' : 'size-10 text-sm';
  if (src) return <img className={`${cls} rounded-full border border-line object-cover`} src={src} alt="" />;
  return <div className={`${cls} grid place-items-center rounded-full bg-gradient-to-br from-[#ffbd6f] via-[#ef5d96] to-[#7657ff] font-semibold text-white`}>{username.slice(0, 1).toUpperCase()}</div>;
}
