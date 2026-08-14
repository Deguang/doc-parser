import fs from 'fs';
import path from 'path';

const tokenData = JSON.parse(fs.readFileSync('/home/codespace/.gemini/antigravity-cli/antigravity-oauth-token', 'utf-8'));
const accessToken = tokenData.token.access_token;

const exportDir = '/workspaces/doc-parser/stitch_export';
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

async function rpc(method, params = {}) {
  const res = await fetch('https://stitch.googleapis.com/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Goog-User-Project': 'default-cli-project'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });
  const data = await res.json();
  return data;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  console.log(`Saved: ${destPath} (${buffer.byteLength} bytes)`);
}

async function main() {
  console.log('Initializing Stitch MCP connection...');
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'stitch-client', version: '1.0.0' }
  });

  const projectId = '13408866854591737782';
  const screenIds = [
    'asset-stub-assets_7e1db539c5c64a61b528e2fc4202420f',
    'b1cdb1266d6940c38030e5b0a99c941b',
    '7b9f0eada651448c9422ab3bc87e0479'
  ];

  const results = {};

  for (const screenId of screenIds) {
    console.log(`\nFetching screen ${screenId}...`);
    const screenRes = await rpc('tools/call', {
      name: 'get_screen',
      arguments: {
        projectId,
        screenId,
        name: `projects/${projectId}/screens/${screenId}`
      }
    });

    console.log('Response:', JSON.stringify(screenRes, null, 2));

    const contentText = screenRes?.result?.content?.[0]?.text;
    let screenData = null;
    if (contentText) {
      try {
        screenData = JSON.parse(contentText);
      } catch (e) {
        screenData = contentText;
      }
    } else {
      screenData = screenRes?.result;
    }

    results[screenId] = screenData;

    // Write raw json metadata
    fs.writeFileSync(
      path.join(exportDir, `${screenId}.json`),
      JSON.stringify(screenRes, null, 2)
    );

    // Extract HTML and screenshot URL
    // Inspect structure
    const htmlCode = screenData?.htmlCode || screenData?.code?.html || screenData?.html || (typeof screenData === 'string' ? screenData : null);
    const screenshotUrl = screenData?.screenshotUrl || screenData?.screenshot?.downloadUrl || screenData?.image?.url || screenData?.imageUrl;
    const htmlUrl = screenData?.htmlUrl || screenData?.htmlCodeUrl || screenData?.codeUrl;

    if (htmlCode && typeof htmlCode === 'string' && htmlCode.includes('<')) {
      fs.writeFileSync(path.join(exportDir, `${screenId}.html`), htmlCode);
      console.log(`Saved HTML directly to ${screenId}.html`);
    } else if (htmlUrl) {
      console.log(`Downloading HTML from ${htmlUrl}...`);
      await downloadFile(htmlUrl, path.join(exportDir, `${screenId}.html`));
    }

    if (screenshotUrl) {
      console.log(`Downloading screenshot from ${screenshotUrl}...`);
      await downloadFile(screenshotUrl, path.join(exportDir, `${screenId}.png`));
    }
  }

  // Also list screens in the project to verify or get more info if needed
  const listRes = await rpc('tools/call', {
    name: 'list_screens',
    arguments: { projectId }
  });
  fs.writeFileSync(
    path.join(exportDir, 'project_screens.json'),
    JSON.stringify(listRes, null, 2)
  );

  console.log('\nExport completed successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
