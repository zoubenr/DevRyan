import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMdFile } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = path.resolve(__dirname, '../../default-config');
const DEFAULT_AGENT_DIR = path.join(DEFAULT_CONFIG_DIR, 'agents');

const hashContent = (content) => crypto.createHash('sha256').update(content).digest('hex');

export function listPackagedAgents() {
  if (!fs.existsSync(DEFAULT_AGENT_DIR)) {
    return [];
  }

  return fs.readdirSync(DEFAULT_AGENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const filePath = path.join(DEFAULT_AGENT_DIR, entry.name);
      const content = fs.readFileSync(filePath, 'utf8');
      const { frontmatter, body } = parseMdFile(filePath);

      return {
        name: entry.name.slice(0, -3),
        path: filePath,
        content,
        hash: hashContent(content),
        frontmatter,
        prompt: body,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
