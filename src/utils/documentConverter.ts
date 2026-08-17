import { toDocument, toMarkdownBytes, type Document, type Block, type Inline, type Format } from '@firecrawl/anydoc-wasm';
import JSZip from 'jszip';

export interface ProcessedAsset {
  id: number;
  mediaType: string;
  filename: string;
  data: Uint8Array;
  base64Url: string;
  blobUrl?: string;
}

export interface ConversionResult {
  markdown: string;
  assets: ProcessedAsset[];
  rawMarkdownWithBase64: string;
  rawMarkdownWithRelativePaths: string;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
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

export function processDocument(bytes: Uint8Array, format: Format | null): ConversionResult {
  let doc: Document | null = null;
  const processedAssets: ProcessedAsset[] = [];

  // PDF only supports toMarkdownBytes in anydoc
  if (format !== 'pdf') {
    try {
      doc = toDocument(bytes, format);
    } catch (e) {
      console.warn('toDocument failed, falling back to toMarkdownBytes:', e);
    }
  }

  // Process assets if available
  if (doc && doc.assets && doc.assets.length > 0) {
    doc.assets.forEach((asset, idx) => {
      const ext = mimeToExt(asset.mediaType);
      const filename = `images/image_${asset.id !== undefined ? asset.id : idx + 1}.${ext}`;
      const base64 = uint8ArrayToBase64(asset.data);
      const base64Url = `data:${asset.mediaType};base64,${base64}`;
      const blob = new Blob([asset.data as unknown as BlobPart], { type: asset.mediaType });
      const blobUrl = URL.createObjectURL(blob);

      processedAssets.push({
        id: asset.id !== undefined ? asset.id : idx,
        mediaType: asset.mediaType,
        filename,
        data: asset.data,
        base64Url,
        blobUrl,
      });
    });
  }

  // Build Markdown from AST if available
  if (doc && doc.blocks) {
    const assetMap = new Map<number, ProcessedAsset>();
    processedAssets.forEach(a => assetMap.set(a.id, a));

    const markdownWithBase64 = renderBlocksToMarkdown(doc.blocks, id => assetMap.get(id)?.base64Url || '');
    const markdownWithRelative = renderBlocksToMarkdown(doc.blocks, id => {
      const a = assetMap.get(id);
      return a ? `./${a.filename}` : '';
    });
    const markdownWithBlob = renderBlocksToMarkdown(doc.blocks, id => assetMap.get(id)?.blobUrl || assetMap.get(id)?.base64Url || '');

    return {
      markdown: markdownWithBlob || markdownWithBase64,
      assets: processedAssets,
      rawMarkdownWithBase64: markdownWithBase64,
      rawMarkdownWithRelativePaths: markdownWithRelative,
    };
  }

  // Fallback to toMarkdownBytes
  const rawText = toMarkdownBytes(bytes, format);
  return {
    markdown: rawText,
    assets: processedAssets,
    rawMarkdownWithBase64: rawText,
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
            if (inline.style.code) text = `\`${text}\``;
            if (inline.style.bold) text = `**${text}**`;
            if (inline.style.italic) text = `*${text}*`;
            if (inline.style.strike) text = `~~${text}~~`;
          }
          return text;
        }
        case 'link': {
          const text = inline.content ? renderInlinesToMarkdown(inline.content, resolveImage) : inline.target?.value || '';
          return `[${text}](${inline.target?.value || ''})`;
        }
        case 'image': {
          const alt = inline.alt || 'Image';
          let src = '';
          if (inline.source?.kind === 'external') {
            src = inline.source.url || '';
          } else if (inline.source?.kind === 'asset' && inline.source.assetId !== undefined) {
            src = resolveImage(inline.source.assetId);
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

  // Add the markdown document
  zip.file(`${docBaseName}.md`, markdownWithRelativePaths);

  // Add images folder
  if (assets.length > 0) {
    const imgFolder = zip.folder('images');
    if (imgFolder) {
      for (const asset of assets) {
        const cleanName = asset.filename.replace(/^images\//, '');
        imgFolder.file(cleanName, asset.data);
      }
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
