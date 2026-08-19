import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';
import { TERMINAL_THEME } from '../constants/terminalTheme.js';

export default function Terminal({ termId, worktreePath, shellId, active, fontFamily, fontSize, lineHeight, type, aiCommand, sessionId }) {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Mount xterm once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const xterm = new XTerm({
      theme: TERMINAL_THEME,
      fontSize: fontSize || 13,
      fontFamily: fontFamily || "'Ubuntu Mono', 'Consolas', monospace",
      lineHeight: lineHeight || 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: false,
      customGlyphs: true,
    });

    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.open(el);

    xterm.loadAddon(new WebLinksAddon((_, url) => {
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank');
    }));
    if (navigator.clipboard?.readText) xterm.loadAddon(new ClipboardAddon());

    try {
      const webgl = new WebglAddon();
      let webglDisposed = false;
      const originalDispose = webgl.dispose.bind(webgl);
      webgl.dispose = () => {
        if (!webglDisposed) {
          webglDisposed = true;
          try { originalDispose(); } catch {}
        }
      };
      webgl.onContextLoss(() => webgl.dispose());
      xterm.loadAddon(webgl);
    } catch {
      // fallback to canvas renderer
    }

    xtermRef.current = xterm;
    fitAddonRef.current = fit;

    xterm.onData((data) => window.api.writeTerminal(termId, data));
    xterm.onResize(({ cols, rows }) => window.api.resizeTerminal(termId, cols, rows));

    // Copy / paste keyboard shortcuts
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;

      // Ctrl+C: copy if text is selected, otherwise pass through (→ sends interrupt)
      if (event.ctrlKey && !event.shiftKey && event.code === 'KeyC') {
        const sel = xterm.getSelection();
        if (sel) {
          window.api.clipboardWrite(sel);
          xterm.clearSelection();
          return false;
        }
        return true;
      }

      // Ctrl+Shift+C: always copy selection (Linux terminal convention)
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        const sel = xterm.getSelection();
        if (sel) window.api.clipboardWrite(sel);
        return false;
      }

      // Ctrl+V / Ctrl+Shift+V: paste from clipboard
      if (event.ctrlKey && event.code === 'KeyV') {
        const text = window.api.clipboardRead();
        if (text) xterm.paste(text);
        return false;
      }

      return true;
    });

    // Right-click: copy if text selected, paste otherwise (Windows Terminal behaviour)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const sel = xterm.getSelection();
      if (sel) {
        window.api.clipboardWrite(sel);
        xterm.clearSelection();
      } else {
        const text = window.api.clipboardRead();
        if (text) xterm.paste(text);
      }
    });

    window.api.createTerminal(termId, worktreePath, shellId, type, aiCommand, sessionId);

    // Double rAF: wait for browser to complete layout before fitting
    let raf1, raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try { fit.fit(); } catch {}
      });
    });

    const obs = new ResizeObserver(() => {
      try {
        fit.fit();
        if (activeRef.current) {
          const rows = xterm.rows ?? 0;
          if (rows > 0) xterm.refresh(0, rows - 1);
        }
      } catch {}
    });
    obs.observe(el);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      obs.disconnect();
      window.api.closeTerminal(termId);
      xterm.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply font/size/lineHeight changes to already-open terminals
  useEffect(() => {
    if (!xtermRef.current) return;
    if (fontFamily) xtermRef.current.options.fontFamily = fontFamily;
    if (fontSize) xtermRef.current.options.fontSize = fontSize;
    if (lineHeight) xtermRef.current.options.lineHeight = lineHeight;
    try { fitAddonRef.current?.fit(); } catch {}
  }, [fontFamily, fontSize, lineHeight]);

  // Receive PTY data
  useEffect(() => {
    return window.api.onTerminalData(({ termId: id, data }) => {
      if (id !== termId) return;
      xtermRef.current?.write(data);
    });
  }, [termId]);

  // Focus + fit when this terminal becomes visible
  useEffect(() => {
    if (active && xtermRef.current) {
      let raf1, raf2;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          try {
            fitAddonRef.current?.fit();
            const rows = xtermRef.current?.rows ?? 0;
            if (rows > 0) xtermRef.current?.refresh(0, rows - 1);
          } catch {}
          xtermRef.current?.focus();
        });
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
  }, [active]);

  return (
    <div
      style={{ visibility: active ? 'visible' : 'hidden', pointerEvents: active ? 'auto' : 'none', position: 'absolute', inset: 0 }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
