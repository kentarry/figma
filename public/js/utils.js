export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, limit = 100) {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function figmaColorToRgba(color, opacity = 1) {
  if (!color) return 'transparent';
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = parseFloat((color.a !== undefined ? color.a * opacity : opacity).toFixed(3));
  if (a === 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function rgbaToHex(r, g, b, a = 1) {
  const hex = [r, g, b].map(v => {
    const h = Math.round(v).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
  if (a < 1) {
    const ah = Math.round(a * 255).toString(16);
    return `#${hex}${ah.length === 1 ? '0' + ah : ah}`;
  }
  return `#${hex}`;
}

export function hexToRgba(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function sanitizeClassName(name) {
  if (!name) return 'element';
  let sanitized = name
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff_-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  
  if (!sanitized) return 'element';
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'cls-' + sanitized;
  }
  return sanitized;
}

export function formatCss(css) {
  return css
    .replace(/\{/g, ' {\n  ')
    .replace(/;/g, ';\n  ')
    .replace(/\n  \}/g, '\n}')
    .replace(/\}\s*/g, '}\n\n')
    .trim();
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export async function downloadAsZip(files, zipName = 'figma-export.zip') {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip 未載入');
  }
  const zip = new JSZip();
  for (const file of files) {
    if (file.blob) {
      // Binary file (e.g. images) — add as raw blob
      zip.file(file.name, file.blob, { binary: true });
    } else {
      // Text file (HTML, CSS, etc.)
      zip.file(file.name, file.content);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateId() {
  return 'id_' + Math.random().toString(36).substring(2, 9);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
