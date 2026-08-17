import { toDocument, toMarkdownBytes, type Document, type Block, type Inline, type Format } from '@firecrawl/anydoc-wasm';
import JSZip from 'jszip';

export interface ProcessedAsset {
  id: number;
  mediaType: string;
  filename: string;
  data: Uint8Array;
  blobUrl?: string;
}

export interface ConversionResult {
  markdown: string; // Markdown with blobUrls for instant, lightweight DOM preview
  assets: ProcessedAsset[];
  rawMarkdownWithRelativePaths: string; // Clean markdown with ./images/ references
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  let base64 = '';
  let i = 0;
  // Unrolled fast 3-byte conversion loop
  for (; i + 2 < len; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    base64 += B64_CHARS[b0 >> 2];
    base64 += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    base64 += B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)];
    base64 += B64_CHARS[b2 & 63];
  }
  if (i < len) {
    const b0 = bytes[i];
    base64 += B64_CHARS[b0 >> 2];
    if (i + 1 < len) {
      const b1 = bytes[i + 1];
      base64 += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
      base64 += B64_CHARS[(b1 & 15) << 2];
      base64 += '=';
    } else {
      base64 += B64_CHARS[(b0 & 3) << 4];
      base64 += '==';
    }
  }
  return base64;
}

export function mimeToExt(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    case 'image/bmp':
      return 'bmp';
    default:
      return 'png';
  }
}

/**
 * Revokes all Blob URLs associated with a conversion result to prevent memory leaks.
 */
export function revokeConversionAssets(result: ConversionResult | null | undefined) {
  if (!result || !result.assets) return;
  for (const asset of result.assets) {
    if (asset.blobUrl) {
      try {
        URL.revokeObjectURL(asset.blobUrl);
      } catch (e) {
        // ignore
      }
      asset.blobUrl = undefined;
    }
  }
}

/**
 * Generates the full Base64-embedded markdown string in a single fast pass,
 * avoiding multi-pass string allocations on 10MB+ book files.
 */
export function getBase64Markdown(result: ConversionResult): string {
  if (!result.assets || result.assets.length === 0) {
    return result.rawMarkdownWithRelativePaths || result.markdown;
  }

  // Pre-calculate data URIs into a lookup map
  const uriMap = new Map<string, string>();
  for (const asset of result.assets) {
    const base64Data = uint8ArrayToBase64(asset.data);
    const dataUri = `data:${asset.mediaType};base64,${base64Data}`;
    uriMap.set(asset.filename, dataUri);
    uriMap.set(`./${asset.filename}`, dataUri);
  }

  // Single-pass replacement over the entire markdown document
  return result.rawMarkdownWithRelativePaths.replace(/\(!?\[.*?\]\(([^)]+)\)|\((images\/[^)]+)\)|\(\.\/(images\/[^)]+)\)/g, (match, p1, p2, p3) => {
    const target = p1 || p2 || p3;
    const dataUri = uriMap.get(target) || uriMap.get(`./${target}`) || uriMap.get(target?.replace(/^\.\//, ''));
    if (dataUri) {
      return match.replace(target, dataUri);
    }
    return match;
  });
}

export function processDocument(bytes: Uint8Array, format: Format | null): ConversionResult {
  let doc: Document | null = null;
  const processedAssets: ProcessedAsset[] = [];

  // Check magic bytes for PDF (%PDF) or format === 'pdf'
  const isPdf = format === 'pdf' || (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

  // PDF only supports toMarkdownBytes in anydoc
  if (!isPdf) {
    try {
      doc = toDocument(bytes, format);
    } catch (e) {
      console.warn('toDocument failed, falling back to toMarkdownBytes:', e);
    }
  }

  // Process assets if available (using memory-efficient Blob URLs)
  if (doc && doc.assets && doc.assets.length > 0) {
    doc.assets.forEach((asset, idx) => {
      const ext = mimeToExt(asset.mediaType);
      const filename = `images/image_${asset.id !== undefined ? asset.id : idx + 1}.${ext}`;
      
      let blobUrl: string | undefined = undefined;
      // In browser environment, create Blob URL for zero-copy rendering
      if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
        try {
          const blob = new Blob([asset.data as unknown as BlobPart], { type: asset.mediaType });
          blobUrl = URL.createObjectURL(blob);
        } catch (e) {
          // fallback in environments without blob
        }
      }

      processedAssets.push({
        id: asset.id !== undefined ? asset.id : idx,
        mediaType: asset.mediaType,
        filename,
        data: asset.data,
        blobUrl,
      });
    });
  }

  // Build Markdown from AST if available
  if (doc && doc.blocks) {
    const assetMap = new Map<number, ProcessedAsset>();
    processedAssets.forEach(a => assetMap.set(a.id, a));

    // Single-pass markdown generation
    const markdownWithRelative = renderBlocksToMarkdown(doc.blocks, id => {
      const a = assetMap.get(id);
      return a ? `./${a.filename}` : '';
    });
    
    let markdownWithBlob = markdownWithRelative;
    if (processedAssets.length > 0) {
      markdownWithBlob = renderBlocksToMarkdown(doc.blocks, id => {
        const a = assetMap.get(id);
        return a ? (a.blobUrl || `./${a.filename}`) : '';
      });
    }

    // Immediately dereference AST to allow garbage collection
    doc = null;

    return {
      markdown: markdownWithBlob,
      assets: processedAssets,
      rawMarkdownWithRelativePaths: markdownWithRelative,
    };
  }

  // Direct conversion for PDF and non-AST documents
  const targetFormat = isPdf ? 'pdf' : format;
  const rawText = toMarkdownBytes(bytes, targetFormat);
  return {
    markdown: rawText,
    assets: processedAssets,
    rawMarkdownWithRelativePaths: rawText,
  };
}

function renderBlocksToMarkdown(blocks: Block[], resolveImage: (assetId: number) => string): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        const prefix = '#'.repeat(Math.max(1, Math.min(6, block.level || 1))) + ' ';
        const text = renderInlinesToMarkdown(block.content || [], resolveImage);
        lines.push(`${prefix}${text}\n`);
        break;
      }
      case 'paragraph': {
        const text = renderInlinesToMarkdown(block.content || [], resolveImage);
        lines.push(`${text}\n`);
        break;
      }
      case 'list': {
        if (block.list && block.list.items) {
          block.list.items.forEach((item, index) => {
            const marker = block.list?.marker === 'decimal' ? `${(block.list.start || 1) + index}. ` : '* ';
            const itemText = renderBlocksToMarkdown(item.blocks, resolveImage).trim();
            lines.push(`${marker}${itemText}`);
          });
          lines.push('');
        }
        break;
      }
      case 'table': {
        if (block.table && block.table.grid) {
          const rows = block.table.grid;
          if (rows.length > 0) {
            rows.forEach((row, rowIndex) => {
              const cells = row.map(cellSlot => {
                if (cellSlot.kind === 'origin' && cellSlot.cell) {
                  return renderBlocksToMarkdown(cellSlot.cell.blocks, resolveImage).replace(/\n/g, ' ').trim();
                }
                return '';
              });
              lines.push(`| ${cells.join(' | ')} |`);
              if (rowIndex === 0) {
                const separators = cells.map(() => '---');
                lines.push(`| ${separators.join(' | ')} |`);
              }
            });
            lines.push('');
          }
        }
        break;
      }
      case 'blockQuote': {
        if (block.blocks) {
          const quoteContent = renderBlocksToMarkdown(block.blocks, resolveImage);
          const quoted = quoteContent
            .split('\n')
            .map(line => (line.trim() ? `> ${line}` : '>'))
            .join('\n');
          lines.push(`${quoted}\n`);
        }
        break;
      }
      case 'codeBlock': {
        const lang = block.lang || '';
        lines.push(`\`\`\`${lang}\n${block.text || ''}\n\`\`\`\n`);
        break;
      }
      case 'rule': {
        lines.push('---\n');
        break;
      }
      default: {
        if (block.content) {
          lines.push(renderInlinesToMarkdown(block.content, resolveImage) + '\n');
        }
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function renderInlinesToMarkdown(inlines: Inline[], resolveImage: (assetId: number) => string): string {
  return inlines
    .map(inline => {
      switch (inline.kind) {
        case 'text': {
          let text = inline.text || '';
          if (inline.style) {
            if (inline.style.bold && inline.style.italic) text = `***${text}***`;
            else if (inline.style.bold) text = `**${text}**`;
            else if (inline.style.italic) text = `*${text}*`;
            if (inline.style.strike) text = `~~${text}~~`;
            if (inline.style.code) text = `\`${text}\``;
          }
          return text;
        }
        case 'link': {
          const text = renderInlinesToMarkdown(inline.content || [], resolveImage);
          const url = inline.target?.value || '';
          return `[${text}](${url})`;
        }
        case 'image': {
          const alt = inline.alt || '';
          let src = '';
          if (inline.source?.kind === 'asset' && inline.source.assetId !== undefined) {
            src = resolveImage(inline.source.assetId);
          } else if (inline.source?.kind === 'external' && inline.source.url) {
            src = inline.source.url;
          }
          return `![${alt}](${src})`;
        }
        case 'lineBreak':
          return '\n';
        default:
          return inline.text || '';
      }
    })
    .join('');
}

export async function createZipExport(
  docBaseName: string,
  markdownWithRelativePaths: string,
  assets: ProcessedAsset[]
): Promise<Blob> {
  const zip = new JSZip();

  // Compress text file with standard fast deflate
  zip.file(`${docBaseName}.md`, markdownWithRelativePaths, {
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Store pre-compressed images directly (STORE mode) to eliminate redundant CPU re-compression
  if (assets.length > 0) {
    const imgFolder = zip.folder('images');
    if (imgFolder) {
      for (const asset of assets) {
        const cleanName = asset.filename.replace(/^images\//, '');
        imgFolder.file(cleanName, asset.data, {
          compression: 'STORE' // 10x faster, zero CPU spike
        });
      }
    }
  }

  return await zip.generateAsync({ 
    type: 'blob',
    streamFiles: true
  });
}
