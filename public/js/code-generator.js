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
      useCssVariables: options.useCssVariables !== false,
      ...options,
    };

    let html = this.generateHtml(parsedTree, 0);
    
    // 1. Extract CSS variables for colors
    let rootVars = '';
    if (this.options.useCssVariables) {
      const colorMap = new Map();
      let colorCount = 0;
      
      for (const rule of this.cssRules) {
        for (const [prop, val] of Object.entries(rule.styles)) {
          if (typeof val === 'string' && (val.startsWith('rgb') || val.startsWith('#'))) {
            if (val.includes('gradient')) continue;
            
            if (!colorMap.has(val)) {
              colorCount++;
              colorMap.set(val, `--color-${colorCount}`);
            }
            rule.styles[prop] = `var(${colorMap.get(val)})`;
          }
        }
      }
      
      if (colorMap.size > 0) {
        rootVars = `/* Colors */\n:root {\n`;
        for (const [val, varName] of colorMap.entries()) {
          rootVars += `  ${varName}: ${val};\n`;
        }
        rootVars += `}\n\n`;
      }
    }
    
    const css = rootVars + this._buildCssOutput();

    // 2. Inject RWD scale-to-fit Javascript if enabled
    if (this.options.responsive === 'scale-fit' && parsedTree && parsedTree.bounds) {
      const w = Math.round(parsedTree.bounds.width) || 1280;
      const h = Math.round(parsedTree.bounds.height) || 720;
      html += `\n<!-- RWD Scale Script -->\n<script>\n(function() {\n  const designWidth = ${w};\n  const designHeight = ${h};\n  const container = document.querySelector('.${parsedTree._resolvedClass}') || document.body.firstElementChild;\n  if (!container) return;\n\n  function doScale() {\n    const ww = window.innerWidth;\n    const scale = ww / designWidth;\n    \n    container.style.transform = 'scale(' + scale + ')';\n    container.style.transformOrigin = 'left top';\n    container.style.width = designWidth + 'px';\n    container.style.height = designHeight + 'px';\n    \n    if (container.parentElement && container.parentElement !== document.body) {\n      container.parentElement.style.height = (designHeight * scale) + 'px';\n      container.parentElement.style.overflow = 'hidden';\n    } else {\n      document.body.style.height = (designHeight * scale) + 'px';\n      document.body.style.overflowX = 'hidden';\n    }\n  }\n\n  window.addEventListener('resize', doScale);\n  window.addEventListener('load', doScale);\n  doScale();\n})();\n</script>\n`;
    }

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
      const content = node.mixedCharacters || this._escapeHtml(node.characters || '');
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
