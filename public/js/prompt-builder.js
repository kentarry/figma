export class PromptBuilder {
  build(parsedTree, options = {}) {
    const framework = options.framework || 'html-css';
    const responsive = options.responsive || 'mobile-first';
    const naming = options.naming || 'bem';
    const units = options.units || 'px';
    const includeImages = options.includeImages !== false;
    const includeColors = options.includeColors !== false;
    const includeTypography = options.includeTypography !== false;

    const sections = [];

    sections.push(this._buildHeader(framework));
    if (includeColors && parsedTree._colorSystem?.length) {
      sections.push(this._buildColorSystem(parsedTree._colorSystem));
    }
    if (includeTypography && parsedTree._fontSystem?.length) {
      sections.push(this._buildTypography(parsedTree._fontSystem));
    }
    sections.push(this._buildDesignSpecs(parsedTree, units));
    sections.push(this._buildComponentTree(parsedTree, 0));
    if (includeImages && parsedTree._imageUrls) {
      sections.push(this._buildImageAssets(parsedTree._imageUrls));
    }
    sections.push(this._buildInstructions(framework, responsive, naming, units));

    return sections.filter(Boolean).join('\n\n---\n\n');
  }

  _buildHeader(framework) {
    const frameworkNames = {
      'html-css': '純 HTML / CSS',
      'react': 'React (JSX + CSS Modules)',
      'vue': 'Vue.js (SFC)',
    };

    return `# 🎨 Figma 設計稿轉換提示詞

> 請根據以下設計規格，生成 **${frameworkNames[framework] || framework}** 程式碼。
> 請嚴格遵循設計稿中的尺寸、顏色、字型與間距。`;
  }

  _buildColorSystem(colors) {
    if (!colors || !colors.length) return '';

    let section = `## 🎨 色彩系統\n\n`;
    section += `| 編號 | 色彩值 | 用途 |\n`;
    section += `|------|--------|------|\n`;

    for (const { color, index } of colors) {
      section += `| ${index} | \`${color}\` | — |\n`;
    }

    return section;
  }

  _buildTypography(fonts) {
    if (!fonts || !fonts.length) return '';

    let section = `## 📝 字型系統\n\n`;
    section += `| 字型 | 字重 |\n`;
    section += `|------|------|\n`;

    const unique = new Map();
    for (const { family, weight } of fonts) {
      const key = `${family}:${weight}`;
      if (!unique.has(key)) {
        unique.set(key, { family, weight });
      }
    }

    for (const { family, weight } of unique.values()) {
      section += `| ${family} | ${weight} |\n`;
    }

    return section;
  }

  _buildDesignSpecs(tree, units) {
    let section = `## 📐 設計規格\n\n`;

    if (tree.bounds) {
      section += `- **畫布尺寸**: ${Math.round(tree.bounds.width)} × ${Math.round(tree.bounds.height)} ${units}\n`;
    }

    section += `- **根元素名稱**: ${tree.name || '—'}\n`;
    section += `- **節點類型**: ${tree.type || '—'}\n`;

    if (tree.styles) {
      const bg = tree.styles['background-color'];
      if (bg) section += `- **背景色**: \`${bg}\`\n`;

      if (tree.styles.padding) section += `- **內距**: \`${tree.styles.padding}\`\n`;
    }

    return section;
  }

  _buildComponentTree(node, depth) {
    if (!node) return '';

    const indent = '  '.repeat(depth);
    const tag = node.htmlTag || 'div';
    const styles = node.styles || {};
    const styleEntries = Object.entries(styles);

    let section = '';

    if (depth === 0) {
      section += `## 🧩 元件結構\n\n\`\`\`\n`;
    }

    let line = `${indent}├─ <${tag}> .${node.className || sanitizeName(node.name)}`;
    if (node.bounds) {
      line += ` [${Math.round(node.bounds.width)}×${Math.round(node.bounds.height)}]`;
    }
    if (node.type === 'TEXT' && node.characters) {
      const text = node.characters.substring(0, 40);
      line += ` "${text}${node.characters.length > 40 ? '...' : ''}"`;
    }
    section += line + '\n';

    if (styleEntries.length > 0) {
      for (const [prop, val] of styleEntries) {
        section += `${indent}│   ${prop}: ${val}\n`;
      }
    }

    if (node.children?.length) {
      for (const child of node.children) {
        section += this._buildComponentTree(child, depth + 1);
      }
    }

    if (depth === 0) {
      section += `\`\`\``;
    }

    return section;
  }

  _buildImageAssets(imageUrls) {
    if (!imageUrls || !Object.keys(imageUrls).length) return '';

    let section = `## 🖼️ 圖片資產\n\n`;
    section += `以下是設計稿中使用的圖片資產連結：\n\n`;

    for (const [nodeId, url] of Object.entries(imageUrls)) {
      section += `- 節點 \`${nodeId}\`: ${url}\n`;
    }

    return section;
  }

  _buildInstructions(framework, responsive, naming, units) {
    let section = `## 📋 實作要求\n\n`;

    section += `### 基本要求\n`;
    section += `- 使用 **語義化 HTML** 標籤\n`;
    section += `- CSS 屬性值請嚴格對應設計稿數值\n`;
    section += `- 所有尺寸使用 **${units}** 單位\n`;
    section += `- 類別命名使用 **${naming}** 慣例\n\n`;

    if (responsive !== 'none') {
      section += `### 響應式設計\n`;
      section += `- 採用 **${responsive === 'mobile-first' ? 'Mobile First' : 'Desktop First'}** 策略\n`;
      section += `- 設定合理的斷點 (768px, 1024px, 1280px)\n`;
      section += `- 彈性容器使用 Flexbox 或 Grid\n\n`;
    }

    if (framework === 'react') {
      section += `### React 特殊要求\n`;
      section += `- 使用函式元件 (Functional Component)\n`;
      section += `- 使用 CSS Modules 或 styled-components\n`;
      section += `- 適當拆分子元件\n`;
      section += `- Props 型別使用 JSDoc 註解\n\n`;
    } else if (framework === 'vue') {
      section += `### Vue.js 特殊要求\n`;
      section += `- 使用 Vue 3 Composition API\n`;
      section += `- 使用 \`<script setup>\` 語法\n`;
      section += `- 使用 Scoped CSS\n`;
      section += `- 適當拆分子元件\n\n`;
    }

    section += `### 品質要求\n`;
    section += `- 程式碼整潔、縮排一致\n`;
    section += `- 避免不必要的巢狀\n`;
    section += `- 顏色值保持與設計稿一致\n`;
    section += `- 確保視覺呈現與設計稿完全相符\n`;

    return section;
  }
}

function sanitizeName(name) {
  if (!name) return 'element';
  return name.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-{2,}/g, '-') || 'element';
}
