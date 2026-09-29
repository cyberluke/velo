// Shared by context menus, submenus, and email selection actions. These surfaces
// are deliberately opaque: the workspace's warm translucent tokens reduce menu contrast.
export const menuSurface = "fixed z-[100] rounded-md border border-border-primary bg-bg-secondary p-1 text-[13px] leading-[18px] font-normal tracking-normal text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.45)]";
export const menuRow = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] leading-[18px] font-normal tracking-normal transition-colors disabled:cursor-default disabled:opacity-40";
export const menuHover = "hover:bg-bg-hover";
export const menuActive = "bg-bg-selected";
export const menuFont = { fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif' };
