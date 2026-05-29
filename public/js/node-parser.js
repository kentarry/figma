import { figmaColorToRgba, sanitizeClassName, rgbaToHex } from './utils.js';

export class NodeParser {
  constructor() {
    this.imageNodes = [];
    this.colors = new Map();
    this.fonts = new Map();
  }

  isGraphicOnly(node) {
    if (!node) return false;
    if (node.type === 'TEXT') return false;
    if (node.children && node.children.length > 0) {
      return node.children.every(child => this.isGraphicOnly(child));
    }
    const graphicTypes = ['RECTANGLE', 'ELLIPSE', 'LINE', 'VECTOR', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION'];
    return graphicTypes.includes(node.type);
  }

  parse(figmaNode, depth = 0) {
    if (!figmaNode) return null;

    const node = {
      id: figmaNode.id,
      name: figmaNode.name,
      type: figmaNode.type,
      className: sanitizeClassName(figmaNode.name),
      htmlTag: this.inferHtmlTag(figmaNode),
      styles: this.extractStyles(figmaNode, depth),
      children: [],
      visible: figmaNode.visible !== false,
      depth,
      originalNode: figmaNode,
    };

    if (figmaNode.absoluteBoundingBox) {
      node.bounds = { ...figmaNode.absoluteBoundingBox };
    }

    if (figmaNode.type === 'TEXT') {
      node.characters = figmaNode.characters || '';
    }

    const hasImageFill = Array.isArray(figmaNode.fills) && figmaNode.fills.some(f => f.type === 'IMAGE');
    const hasExportSettings = Array.isArray(figmaNode.exportSettings) && figmaNode.exportSettings.length > 0;
    const isGraphic = this.isGraphicOnly(figmaNode);

    if (hasImageFill || hasExportSettings || (isGraphic && depth > 0)) {
      this.imageNodes.push(node.id);
      node.hasImage = true;
    }

    if (Array.isArray(figmaNode.children) && figmaNode.visible !== false) {
      node.children = figmaNode.children
        .filter(c => c.visible !== false)
        .map(c => this.parse(c, depth + 1))
        .filter(Boolean);
    }

    return node;
  }

  extractStyles(node, depth) {
    if (!node) return {};
    const styles = {};

    const bbox = node.absoluteBoundingBox;
    if (bbox && bbox.width != null && bbox.height != null) {
      styles.width = `${Math.round(bbox.width)}px`;
      styles.height = `${Math.round(bbox.height)}px`;
    }

    this._extractFills(node, styles);
    this._extractStrokes(node, styles);
    this._extractEffects(node, styles);
    this._extractLayout(node, styles);
    this._extractCornerRadius(node, styles);
    this._extractTextStyles(node, styles);

    if (node.opacity !== undefined && node.opacity < 1) {
      styles.opacity = node.opacity.toFixed(2);
    }

    if (node.clipsContent) {
      styles.overflow = 'hidden';
    }

    // Strip borders and backgrounds from image tags to prevent visual blank frames
    const htmlTag = this.inferHtmlTag(node);
    const hasImageFill = Array.isArray(node.fills) && node.fills.some(f => f.type === 'IMAGE');
    const hasExportSettings = Array.isArray(node.exportSettings) && node.exportSettings.length > 0;
    const isGraphic = this.isGraphicOnly(node);

    if (htmlTag === 'img') {
      delete styles.border;
      delete styles.outline;
      delete styles['background-color'];
      delete styles['background-image'];
      delete styles['background'];
    } else if (hasImageFill || hasExportSettings || (isGraphic && depth > 0)) {
      // For buttons/divs with image fill, export settings, or graphic-only assets,
      // strip layout border, outline, background-color, and solid background
      // shorthand to ensure transparent png/svg backgrounds render cleanly.
      delete styles.border;
      delete styles.outline;
      delete styles['background-color'];
      delete styles['background'];
      if (styles['background-image'] && !styles['background-image'].includes('url(')) {
        delete styles['background-image'];
      }
    }

    return styles;
  }

  _extractFills(node, styles) {
    if (node?.type === 'TEXT') return;
    if (!Array.isArray(node?.fills) || !node.fills.length) return;
    const visibleFills = node.fills.filter(f => f.visible !== false);
    if (!visibleFills.length) return;

    // Single fill: use simple properties for backward compatibility
    if (visibleFills.length === 1) {
      const fill = visibleFills[0];
      this._applySingleFill(fill, styles);
      return;
    }

    // Multiple fills: generate layered CSS background (last fill = bottom layer)
    // Figma renders fills top-to-bottom, CSS layers are also top-to-bottom in shorthand
    const layers = [];
    let hasImage = false;

    for (const fill of visibleFills) {
      if (fill.type === 'SOLID' && fill.color) {
        const rgba = figmaColorToRgba(fill.color, fill.opacity);
        layers.push(`linear-gradient(${rgba}, ${rgba})`);
        this._trackColor(rgba);
      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
        const stops = fill.gradientStops
          .map(s => `${figmaColorToRgba(s.color)} ${Math.round(s.position * 100)}%`)
          .join(', ');
        layers.push(`linear-gradient(${stops})`);
      } else if (fill.type === 'IMAGE') {
        hasImage = true;
      }
    }

    if (layers.length) {
      styles['background'] = layers.join(', ');
    }
    if (hasImage) {
      styles['background-size'] = 'cover';
      styles['background-position'] = 'center';
      styles['background-repeat'] = 'no-repeat';
    }
  }

  /**
   * Apply a single fill to styles (used when there's exactly one visible fill).
   * @param {object} fill - The Figma fill object
   * @param {object} styles - The styles object to populate
   */
  _applySingleFill(fill, styles) {
    if (fill.type === 'SOLID' && fill.color) {
      const rgba = figmaColorToRgba(fill.color, fill.opacity);
      styles['background-color'] = rgba;
      this._trackColor(rgba);
    } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
      const stops = fill.gradientStops
        .map(s => `${figmaColorToRgba(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      styles['background-image'] = `linear-gradient(${stops})`;
    } else if (fill.type === 'IMAGE') {
      styles['background-size'] = fill.scaleMode === 'FILL' ? 'cover' : 'contain';
      styles['background-position'] = 'center';
      styles['background-repeat'] = 'no-repeat';
    }
  }

  _extractStrokes(node, styles) {
    if (!Array.isArray(node?.strokes) || !node.strokes.length) return;
    const stroke = node.strokes.find(s => s.visible !== false);
    if (!stroke?.color) return;

    const color = figmaColorToRgba(stroke.color, stroke.opacity);
    const weight = node.strokeWeight || 1;
    const align = node.strokeAlign || 'INSIDE';
    styles.border = `${weight}px solid ${color}`;

    if (align === 'OUTSIDE') {
      styles['outline'] = `${weight}px solid ${color}`;
      delete styles.border;
    }
  }

  _extractEffects(node, styles) {
    if (!Array.isArray(node?.effects) || !node.effects.length) return;

    const shadows = [];
    const filters = [];

    for (const effect of node.effects) {
      if (effect.visible === false) continue;

      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        const c = effect.color ? figmaColorToRgba(effect.color) : 'rgba(0,0,0,0.25)';
        const x = Math.round(effect.offset?.x || 0);
        const y = Math.round(effect.offset?.y || 0);
        const blur = Math.round(effect.radius || 0);
        const spread = Math.round(effect.spread || 0);
        const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
        shadows.push(`${inset}${x}px ${y}px ${blur}px ${spread}px ${c}`);
      } else if (effect.type === 'LAYER_BLUR') {
        filters.push(`blur(${Math.round(effect.radius || 0)}px)`);
      } else if (effect.type === 'BACKGROUND_BLUR') {
        styles['backdrop-filter'] = `blur(${Math.round(effect.radius || 0)}px)`;
      }
    }

    if (shadows.length) styles['box-shadow'] = shadows.join(', ');
    if (filters.length) styles.filter = filters.join(' ');
  }

  _extractLayout(node, styles) {
    if (!node) return;

    if (node.layoutMode) {
      styles.display = 'flex';
      styles['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';

      const justifyMap = {
        MIN: 'flex-start',
        CENTER: 'center',
        MAX: 'flex-end',
        SPACE_BETWEEN: 'space-between',
      };
      const alignMap = {
        MIN: 'flex-start',
        CENTER: 'center',
        MAX: 'flex-end',
        STRETCH: 'stretch',
      };

      if (node.primaryAxisAlignItems) {
        styles['justify-content'] = justifyMap[node.primaryAxisAlignItems] || 'flex-start';
      }
      if (node.counterAxisAlignItems) {
        styles['align-items'] = alignMap[node.counterAxisAlignItems] || 'flex-start';
      }
      if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
        styles.gap = `${node.itemSpacing}px`;
      }
      if (node.layoutWrap === 'WRAP') {
        styles['flex-wrap'] = 'wrap';
      }
    }

    // Auto Layout sizing properties for child nodes
    // (These are set on the child, not the parent)
    if (node.layoutSizingHorizontal === 'FILL') {
      styles['flex'] = styles['flex'] || '1';
      styles['width'] = '100%';
    } else if (node.layoutSizingHorizontal === 'HUG') {
      styles['width'] = 'auto';
    }

    if (node.layoutSizingVertical === 'FILL') {
      styles['height'] = '100%';
    } else if (node.layoutSizingVertical === 'HUG') {
      styles['height'] = 'auto';
    }

    // layoutAlign for cross-axis alignment of individual children
    if (node.layoutAlign === 'STRETCH') {
      styles['align-self'] = 'stretch';
    }

    // layoutGrow for main-axis fill
    if (node.layoutGrow === 1) {
      styles['flex-grow'] = '1';
    }

    // Note: constraint-based positioning is intentionally NOT applied here.
    // All positioning (absolute/relative) is handled by _applyAbsolutePositions in app.js
    // to avoid conflicts between the two systems.

    if (node.paddingLeft !== undefined || node.paddingTop !== undefined) {
      const pt = node.paddingTop || 0;
      const pr = node.paddingRight || 0;
      const pb = node.paddingBottom || 0;
      const pl = node.paddingLeft || 0;
      if (pt === pr && pr === pb && pb === pl && pt > 0) {
        styles.padding = `${pt}px`;
      } else if (pt === pb && pl === pr && (pt > 0 || pl > 0)) {
        styles.padding = `${pt}px ${pl}px`;
      } else if (pt > 0 || pr > 0 || pb > 0 || pl > 0) {
        styles.padding = `${pt}px ${pr}px ${pb}px ${pl}px`;
      }
    }
  }

  _extractCornerRadius(node, styles) {
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      styles['border-radius'] = `${node.cornerRadius}px`;
    } else if (node.rectangleCornerRadii) {
      const [tl, tr, br, bl] = node.rectangleCornerRadii;
      if (tl === tr && tr === br && br === bl && tl > 0) {
        styles['border-radius'] = `${tl}px`;
      } else {
        styles['border-radius'] = `${tl}px ${tr}px ${br}px ${bl}px`;
      }
    }
  }

  _extractTextStyles(node, styles) {
    if (node?.type !== 'TEXT') return;

    const s = node.style || {};
    if (s.fontFamily) {
      styles['font-family'] = `'${s.fontFamily}', sans-serif`;
      this._trackFont(s.fontFamily, s.fontWeight);
    }
    if (s.fontSize) styles['font-size'] = `${s.fontSize}px`;
    if (s.fontWeight) styles['font-weight'] = String(s.fontWeight);
    if (s.lineHeightPx) styles['line-height'] = `${Math.round(s.lineHeightPx)}px`;
    if (s.letterSpacing != null) styles['letter-spacing'] = `${Number(s.letterSpacing).toFixed(1)}px`;
    if (s.textAlignHorizontal) {
      const map = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
      styles['text-align'] = map[s.textAlignHorizontal] || 'left';
    }
    if (s.textDecoration === 'UNDERLINE') styles['text-decoration'] = 'underline';
    if (s.textCase === 'UPPER') styles['text-transform'] = 'uppercase';
    if (s.textCase === 'LOWER') styles['text-transform'] = 'lowercase';

    if (Array.isArray(node.fills) && node.fills.length) {
      const fill = node.fills.find(f => f.visible !== false && f.type === 'SOLID');
      if (fill?.color) {
        const rgba = figmaColorToRgba(fill.color, fill.opacity);
        styles.color = rgba;
        this._trackColor(rgba);
      }
    }
  }

  _trackColor(colorStr) {
    if (!this.colors.has(colorStr)) {
      this.colors.set(colorStr, (this.colors.size + 1));
    }
  }

  _trackFont(family, weight) {
    const key = `${family}:${weight || 400}`;
    if (!this.fonts.has(key)) {
      this.fonts.set(key, { family, weight: weight || 400 });
    }
  }

  inferHtmlTag(node) {
    const name = (node.name || '').toLowerCase();
    const type = node.type;

    if (type === 'TEXT') return 'p';
    if (name.includes('button') || name.includes('btn')) return 'button';
    if (name.includes('input') || name.includes('field')) return 'input';
    if (name.includes('image') || name.includes('img') || name.includes('photo') || name.includes('avatar')) return 'img';
    if (name.includes('icon')) return 'span';
    if (name.includes('link') || name.includes('url')) return 'a';
    if (name.includes('heading') || name.includes('title') || name.match(/^h[1-6]$/)) {
      const match = name.match(/h([1-6])/);
      return match ? `h${match[1]}` : 'h2';
    }
    if (name.includes('nav')) return 'nav';
    if (name.includes('header')) return 'header';
    if (name.includes('footer')) return 'footer';
    if (name.includes('section')) return 'section';
    if (name.includes('list')) return 'ul';
    if (name.includes('item')) return 'li';

    // If the node has an IMAGE fill and no children, render as <img>
    if (Array.isArray(node.fills) && node.fills.some(f => f.type === 'IMAGE') && (!Array.isArray(node.children) || !node.children.length)) {
      return 'img';
    }

    if (type === 'FRAME' || type === 'COMPONENT' || type === 'INSTANCE' || type === 'GROUP') return 'div';
    if (type === 'RECTANGLE' || type === 'ELLIPSE' || type === 'LINE' || type === 'VECTOR') return 'div';

    return 'div';
  }

  getColorSystem() {
    return [...this.colors.entries()].map(([color, index]) => ({ color, index }));
  }

  getFontSystem() {
    return [...this.fonts.values()];
  }

  getImageNodeIds() {
    return [...this.imageNodes];
  }

  reset() {
    this.imageNodes = [];
    this.colors.clear();
    this.fonts.clear();
  }
}
