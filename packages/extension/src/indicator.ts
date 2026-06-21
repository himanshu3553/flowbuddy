// On-page TOAST: a brief, NON-BLOCKING confirmation that fades out on its own. It never covers
// the page (pointer-events:none, auto-dismiss). The persistent "is recording" state lives on the
// extension instead — the popup's blinking red REC dot + the toolbar REC badge.

type ToastKind = 'rec' | 'done' | 'fail' | 'info';

const BG: Record<ToastKind, string> = {
  rec: '#d12f2f',
  done: '#1a8a4f',
  fail: '#c0392b',
  info: '#333',
};

let host: HTMLDivElement | null = null;
let timer: number | null = null;

/** Show a transient toast near the top of the page; auto-removes after `durationMs`. */
export function showToast(message: string, kind: ToastKind = 'info', durationMs = 2000): void {
  hideToast();
  host = document.createElement('div');
  // pointer-events:none → the toast can never intercept clicks or block the page.
  host.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{all:initial}
      .toast{display:flex;align-items:center;gap:8px;background:${BG[kind]};color:#fff;
        font:600 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        padding:9px 14px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.28);max-width:80vw;
        opacity:0;transition:opacity .18s ease}
      .dot{width:9px;height:9px;border-radius:50%;background:#fff;flex:none}
      .dot.blink{animation:b 1s ease-in-out infinite}
      @keyframes b{50%{opacity:.25}}
    </style>
    <div class="toast"><span class="dot"></span><span class="msg"></span></div>`;
  const toast = root.querySelector('.toast') as HTMLElement;
  const dot = root.querySelector('.dot') as HTMLElement;
  const msg = root.querySelector('.msg') as HTMLElement;
  msg.textContent = message; // textContent → no HTML injection from error strings
  if (kind === 'rec') dot.classList.add('blink');
  else dot.style.display = 'none';
  (document.body || document.documentElement).appendChild(host);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  timer = setTimeout(hideToast, durationMs) as unknown as number;
}

export function hideToast(): void {
  if (timer != null) { clearTimeout(timer); timer = null; }
  host?.remove();
  host = null;
}
