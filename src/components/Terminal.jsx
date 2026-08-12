import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';

export default function Terminal({ termId, worktreePath, shellId, active, fontFamily, fontSize, lineHeight }) {
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
      theme: {
        background: '#0f0f0f',
        foreground: '#d4d4d4',
        cursor: '#7c3aed',
        cursorAccent: '#0f0f0f',
        selectionBackground: '#7c3aed44',
        black:         '#1e1e2e',
        red:           '#f38ba8',
        green:         '#a6e3a1',
        yellow:        '#f9e2af',
        blue:          '#89b4fa',
        magenta:       '#cba6f7',
        cyan:          '#89dceb',
        white:         '#cdd6f4',
        brightBlack:   '#585b70',
        brightRed:     '#f38ba8',
        brightGreen:   '#a6e3a1',
        brightYellow:  '#f9e2af',
        brightBlue:    '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan:    '#89dceb',
        brightWhite:   '#cdd6f4',
      },
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

    xterm.loadAddon(new WebLinksAddon((_, url) => window.open(url, '_blank')));
    xterm.loadAddon(new ClipboardAddon());

    let webglAddon = null;
    let webglDisposed = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
        const isSoftware = /swiftshader|software|llvmpipe|mesa/i.test(renderer);
        if (!isSoftware) {
          webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => {
            if (!webglDisposed) {
              webglDisposed = true;
              webglAddon.dispose();
            }
          });
          xterm.loadAddon(webglAddon);
        }
      }
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

    window.api.createTerminal(termId, worktreePath, shellId);

    // Double rAF: wait for browser to complete layout before fitting
    let raf1, raf2;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try { fit.fit(); } catch {}
      });
    });

    const obs = new ResizeObserver(() => {
      try { fit.fit(); } catch {}
    });
    obs.observe(el);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      obs.disconnect();
      window.api.closeTerminal(termId);
      webglDisposed = true;
      xterm.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply font/size/lineHeight changes to already-open terminals
  useEffect(() => {
    if (xtermRef.current && fontFamily) {
      xtermRef.current.options.fontFamily = fontFamily;
      try { fitAddonRef.current?.fit(); } catch {}
    }
  }, [fontFamily]);

  useEffect(() => {
    if (xtermRef.current && fontSize) {
      xtermRef.current.options.fontSize = fontSize;
      try { fitAddonRef.current?.fit(); } catch {}
    }
  }, [fontSize]);

  useEffect(() => {
    if (xtermRef.current && lineHeight) {
      xtermRef.current.options.lineHeight = lineHeight;
      try { fitAddonRef.current?.fit(); } catch {}
    }
  }, [lineHeight]);

  // Receive PTY data
  useEffect(() => {
    return window.api.onTerminalData(({ termId: id, data }) => {
      if (id === termId) xtermRef.current?.write(data);
    });
  }, [termId]);

  // Focus + fit when this terminal becomes visible
  useEffect(() => {
    if (active && xtermRef.current) {
      // rAF ensures the display:block has been applied before fitting
      requestAnimationFrame(() => {
        try { fitAddonRef.current?.fit(); } catch {}
        xtermRef.current?.focus();
      });
    }
  }, [active]);

  return (
    <div
      style={{ display: active ? 'block' : 'none', position: 'absolute', inset: 0 }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
