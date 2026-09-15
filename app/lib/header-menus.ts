import { useEffect } from 'react';

export function useHeaderMenus() {
  useEffect(() => {
    const menus = () => Array.from(document.querySelectorAll<HTMLDetailsElement>('details.session-more[open]'));
    const place = (menu: HTMLDetailsElement) => {
      const trigger = menu.querySelector('summary'), panel = menu.querySelector<HTMLElement>('.session-more-body');
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      panel.style.setProperty('position','fixed','important');
      panel.style.setProperty('right','auto','important');
      panel.style.setProperty('max-width',`${Math.max(0,innerWidth-24)}px`,'important');
      panel.style.setProperty('min-width','min(200px, calc(100vw - 24px))','important');
      panel.style.setProperty('z-index','1000','important');
      const size = panel.getBoundingClientRect();
      panel.style.setProperty('left',`${Math.max(12,Math.min(anchor.right-size.width,innerWidth-size.width-12))}px`,'important');
      const below = innerHeight-anchor.bottom-20;
      const above = anchor.top-20;
      const flip = below < Math.min(size.height,200) && above > below;
      panel.style.setProperty('max-height',`${Math.max(40,flip?above:below)}px`,'important');
      panel.style.setProperty('top',`${flip?Math.max(12,anchor.top-panel.getBoundingClientRect().height-8):anchor.bottom+8}px`,'important');
    };
    const toggle = (event: Event) => {
      const menu = event.target;
      if (!(menu instanceof HTMLDetailsElement) || !menu.matches('.session-more') || !menu.open) return;
      menus().forEach(other => { if(other !== menu) other.open = false; });
      place(menu);
    };
    const outside = (event: Event) => menus().forEach(menu => { if(event.target instanceof Node && !menu.contains(event.target)) menu.open=false; });
    const close = () => menus().forEach(menu => { menu.open=false; });
    const key = (event: KeyboardEvent) => { if(event.key==='Escape') menus().forEach(menu=>{menu.open=false;menu.querySelector('summary')?.focus();}); };
    const reposition = () => menus().forEach(place);
    document.addEventListener('toggle',toggle,true);
    document.addEventListener('pointerdown',outside);
    document.addEventListener('focusin',outside);
    document.addEventListener('keydown',key);
    window.addEventListener('blur',close);
    window.addEventListener('resize',reposition);
    document.addEventListener('scroll',reposition,true);
    return () => {
      document.removeEventListener('toggle',toggle,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',key);window.removeEventListener('blur',close);window.removeEventListener('resize',reposition);document.removeEventListener('scroll',reposition,true);
    };
  }, []);
}
