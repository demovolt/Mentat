import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { TERMINAL_THEME } from '../constants/terminalTheme.js';

export default function Terminal({ termId, worktreePath, shellId, active, fontFamily, fontSize, lineHeight, gpuOnly, type, aiCommand, sessionId }) {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [webglError, setWebglError] = useState(null);

  // Mount xterm once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const xterm = new XTerm({
      theme: TERMINAL_THEME,
      fontSize: fontSize || 13,
      fontFamily: fontFamily || "'Ubuntu Mono', 'Consolas', monospace",
      fontWeight: '500',
      fontWeightBold: 'bold',
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
    } catch (err) {
      if (gpuOnly) {
        xterm.dispose();
        setWebglError(err?.message || 'WebGL unavailable');
        return;
      }
    }

    xtermRef.current = xterm;
    fitAddonRef.current = fit;

    xterm.onData((data) => window.api.writeTerminal(termId, data));
    xterm.onResize(({ cols, rows }) => window.api.resizeTerminal(termId, cols, rows));

    const cbWrite = (text) => {
      console.log('[clipboard] write:', JSON.stringify(text.slice(0, 40)));
      window.api.clipboardWrite(text);
    };
    const cbPaste = () => window.api.clipboardRead().then(text => {
      console.log('[clipboard] paste:', JSON.stringify((text || '').slice(0, 40)));
      if (text) xterm.paste(text);
    });

    // Copy / paste keyboard shortcuts
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;

      // Ctrl+C: copy if text is selected, otherwise pass through (→ sends interrupt)
      if (event.ctrlKey && !event.shiftKey && event.code === 'KeyC') {
        const sel = xterm.getSelection();
        if (sel) { cbWrite(sel); xterm.clearSelection(); return false; }
        return true;
      }

      // Ctrl+Shift+C: always copy selection (Linux terminal convention)
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        const sel = xterm.getSelection();
        if (sel) cbWrite(sel);
        return false;
      }

      // Ctrl+V / Ctrl+Shift+V: block ^V from going to PTY; paste event fires separately
      if (event.ctrlKey && event.code === 'KeyV') return false;

      return true;
    });

    // Intercept paste event before xterm — stopPropagation prevents xterm's own paste handler
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cbPaste();
    }, { capture: true });

    // Auto-copy on selection change (xterm-native event, fires reliably)
    xterm.onSelectionChange(() => {
      const sel = xterm.getSelection();
      if (sel) cbWrite(sel);
    });

    // Right-click: copy if text selected, paste otherwise (Windows Terminal behaviour)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const sel = xterm.getSelection();
      if (sel) { cbWrite(sel); xterm.clearSelection(); }
      else cbPaste();
    });

    window.api.createTerminal(termId, worktreePath, shellId, type, aiCommand, sessionId);

    // Single rAF: wait for browser to complete layout before fitting
    let raf1 = requestAnimationFrame(() => {
      try { fit.fit(); } catch {}
    });

    let resizeTimer = null;
    const obs = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          fit.fit();
          if (activeRef.current) {
            const rows = xterm.rows ?? 0;
            if (rows > 0) xterm.refresh(0, rows - 1);
          }
        } catch {}
      }, 16);
    });
    obs.observe(el);

    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(resizeTimer);
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
    // Strip mouse-tracking enable sequences so text selection always works in AI terminals.
    // Claude Code sends these to capture mouse clicks for its own UI, but we prioritize selection.
    const MOUSE_ON_RE = /\x1b\[\?(1000|1002|1003|1006|1015)h/g;
    return window.api.onTerminalData(({ termId: id, data }) => {
      if (id !== termId) return;
      const out = type === 'ai' ? data.replace(MOUSE_ON_RE, '') : data;
      xtermRef.current?.write(out);
    });
  }, [termId, type]);

  // Focus + fit when this terminal becomes visible
  useEffect(() => {
    if (active && xtermRef.current) {
      const raf1 = requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          const rows = xtermRef.current?.rows ?? 0;
          if (rows > 0) xtermRef.current?.refresh(0, rows - 1);
        } catch {}
        xtermRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf1);
    }
  }, [active]);

  if (webglError) {
    return (
      <div style={{ visibility: active ? 'visible' : 'hidden', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', color: '#f87171', fontFamily: 'monospace', fontSize: 13, textAlign: 'center', padding: 24 }}>
        GPU rendering failed: {webglError}<br />
        Disable "GPU Only" in settings to allow CPU fallback.
      </div>
    );
  }

  return (
    <div
      style={{ visibility: active ? 'visible' : 'hidden', pointerEvents: active ? 'auto' : 'none', position: 'absolute', inset: 0 }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
