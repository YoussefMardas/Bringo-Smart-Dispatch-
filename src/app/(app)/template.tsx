/** Remonté à chaque navigation : le contenu entre en douceur. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise">{children}</div>;
}
