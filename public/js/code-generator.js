import { sanitizeClassName } from './utils.js';

export class CodeGenerator {
  constructor() {
    this.classCounter = new Map();
    this.cssRules = [];
  }

  generate(parsedTree, options = {}) {
    this.classCounter.clear();
    this.cssRules = [];
    this.options = {
      naming: options.naming || 'kebab-case',
      units: options.units || 'px',
      includeReset: options.includeReset !== false,
      ...options,
    };

    const html = this.generateHtml(parsedTree, 0);
    const css = this._buildCssOutput();

    return { html, css };
  }

  generateHtml(node, indent = 0) {
    if (!node || !node.visible) return '';

    const tag = node.htmlTag || 'div';
    const className = this._uniqueClassName(node.className || sanitizeClassName(node.name));
    const pad = '  '.repeat(indent);
    node._resolvedClass = className;

    this._generateCssRule(className, node.styles);

    if (tag === 'img') {
      const src = node.imageUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const alt = this._escapeAttr(node.name || '');
      return `${pad}<img class="${className}" data-figma-name="${this._escapeAttr(node.name)}" src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.style.background='#333';this.style.objectFit='contain';">\n`;
    }

    if (tag === 'input') {
      const placeholder = this._escapeAttr(node.characters || '');
      return `${pad}<input class="${className}" data-figma-name="${this._escapeAttr(node.name)}" type="text" placeholder="${placeholder}">\n`;
    }

    if (node.type === 'TEXT' || !node.children?.length) {
      const content = this._escapeHtml(node.characters || '');
      if (!content && tag === 'div') {
        return `${pad}<div class="${className}" data-figma-name="${this._escapeAttr(node.name)}"></div>\n`;
      }
      return `${pad}<${tag} class="${className}" data-figma-name="${this._escapeAttr(node.name)}">${content}</${tag}>\n`;
    }

    let html = `${pad}<${tag} class="${className}" data-figma-name="${this._escapeAttr(node.name)}">\n`;
    for (const child of node.children) {
      html += this.generateHtml(child, indent + 1);
    }
    html += `${pad}</${tag}>\n`;

    return html;
  }

  generateCss(node, selector) {
    if (!node) return '';
    const className = selector || node._resolvedClass || sanitizeClassName(node.name);
    let css = '';

    if (node.styles && Object.keys(node.styles).length) {
      css += `.${className} {\n`;
      for (const [prop, value] of Object.entries(node.styles)) {
        css += `  ${prop}: ${value};\n`;
      }
      css += '}\n\n';
    }

    if (node.children) {
      for (const child of node.children) {
        css += this.generateCss(child);
      }
    }

    return css;
  }

  _generateCssRule(className, styles) {
    if (!styles || !Object.keys(styles).length) return;

    const filteredStyles = { ...styles };

    if (this.options.units === 'rem') {
      for (const [prop, val] of Object.entries(filteredStyles)) {
        if (typeof val === 'string' && val.endsWith('px') && !['border', 'box-shadow', 'outline'].some(p => prop.includes(p))) {
          const num = parseFloat(val);
          if (!isNaN(num) && num !== 0) {
            filteredStyles[prop] = `${(num / 16).toFixed(4).replace(/\.?0+$/, '')}rem`;
          }
        }
      }
    }

    this.cssRules.push({ selector: `.${className}`, styles: filteredStyles });
  }

  _buildCssOutput() {
    let css = '';

    if (this.options.includeReset) {
      css += `/* Reset */\n* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\n`;
    }

    for (const rule of this.cssRules) {
      css += `${rule.selector} {\n`;
      for (const [prop, value] of Object.entries(rule.styles)) {
        css += `  ${prop}: ${value};\n`;
      }
      css += '}\n\n';
    }

    return css;
  }

  _uniqueClassName(base) {
    const name = this.options.naming === 'bem'
      ? base.replace(/-/g, '__')
      : this.options.naming === 'camelCase'
        ? base.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        : base;

    const count = this.classCounter.get(name) || 0;
    this.classCounter.set(name, count + 1);
    return count === 0 ? name : `${name}-${count}`;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _escapeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
