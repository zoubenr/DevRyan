import fs from 'node:fs/promises';
import path from 'node:path';
import { tool } from '@opencode-ai/plugin';

const DEFAULT_PRESET = 'default';
const DEFAULT_COUNCIL_AGENT = 'builder';
const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeVariant = (variant) => {
  if (typeof variant !== 'string') return undefined;
  const trimmed = variant.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined;
  return trimmed;
};

const formatModelLabel = ({ model, variant }) => {
  const normalizedVariant = normalizeVariant(variant);
  return `${model}${normalizedVariant ? `/${normalizedVariant}` : ''}`;
};

const stringifyErrorValue = (value) => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const unwrap = (result, label, { allowEmpty = false } = {}) => {
  if (result?.error) {
    const status = result?.response?.status;
    const raw = result.error;
    const message = raw && typeof raw === 'object' && 'message' in raw
      ? stringifyErrorValue(raw.message)
      : stringifyErrorValue(raw);
    throw new Error(`${label} failed${status ? ` (${status})` : ''}: ${message}`);
  }
  if (!allowEmpty && result?.data === undefined) {
    throw new Error(`${label} returned no data`);
  }
  return result?.data;
};

const parseModelRef = (ref) => {
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash >= trimmed.length - 1) return null;
  return {
    providerID: trimmed.slice(0, slash),
    modelID: trimmed.slice(slash + 1),
  };
};

const extractFrontmatter = (content) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? match[1] : '';
};

const cleanYamlScalar = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseCouncilFrontmatter = (frontmatter) => {
  const lines = frontmatter.split(/\r?\n/);
  const councillors = [];
  const modelRefs = [];
  let scalarModel = null;
  let scalarVariant = null;
  let block = null;

  for (const line of lines) {
    const modelMatch = /^model:\s*(.+)$/.exec(line);
    if (modelMatch && !line.startsWith(' ')) {
      scalarModel = cleanYamlScalar(modelMatch[1]);
      block = null;
      continue;
    }

    const variantMatch = /^variant:\s*(.+)$/.exec(line);
    if (variantMatch && !line.startsWith(' ')) {
      scalarVariant = cleanYamlScalar(variantMatch[1]);
      block = null;
      continue;
    }

    if (/^modelRefs:\s*$/.test(line)) {
      block = 'modelRefs';
      continue;
    }
    if (/^councillors:\s*$/.test(line)) {
      block = 'councillors';
      continue;
    }
    if (/^\S/.test(line)) {
      block = null;
    }

    if (block === 'modelRefs') {
      const refMatch = /^\s*-\s*(.+)$/.exec(line);
      if (refMatch) modelRefs.push(cleanYamlScalar(refMatch[1]));
      continue;
    }

    if (block === 'councillors') {
      const councillorMatch = /^\s*-\s*model:\s*(.+)$/.exec(line);
      if (councillorMatch) {
        councillors.push({ model: cleanYamlScalar(councillorMatch[1]) });
        continue;
      }
      const councillorVariantMatch = /^\s*variant:\s*(.+)$/.exec(line);
      if (councillorVariantMatch && councillors.length > 0) {
        const variant = normalizeVariant(cleanYamlScalar(councillorVariantMatch[1]));
        if (variant) councillors[councillors.length - 1].variant = variant;
      }
    }
  }

  if (councillors.length > 0) return councillors;
  if (modelRefs.length > 0) {
    const variant = normalizeVariant(scalarVariant);
    return modelRefs.map((model, index) => ({
      model,
      ...(index === 0 && variant ? { variant } : {}),
    }));
  }
  const variant = normalizeVariant(scalarVariant);
  return scalarModel ? [{ model: scalarModel, ...(variant ? { variant } : {}) }] : [];
};

const readCouncilModelsFromConfig = async () => {
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (!configDir) return [];
  try {
    const content = await fs.readFile(path.join(configDir, 'agents', 'council.md'), 'utf8');
    return parseCouncilFrontmatter(extractFrontmatter(content));
  } catch {
    return [];
  }
};

const listCouncilModels = async (client, directory) => {
  const fromFile = await readCouncilModelsFromConfig();
  if (fromFile.length > 0) return fromFile;

  const agents = unwrap(await client.app.agents({
    query: { directory },
  }), 'app.agents');
  const council = Array.isArray(agents)
    ? agents.find((agent) => agent?.name === 'council')
    : null;
  const model = council?.model?.providerID && council?.model?.modelID
    ? `${council.model.providerID}/${council.model.modelID}`
    : null;
  const variant = normalizeVariant(council?.variant);
  return model ? [{ model, ...(variant ? { variant } : {}) }] : [];
};

const assistantTextFromMessages = (records) => {
  const assistants = Array.isArray(records)
    ? records.filter((record) => record?.info?.role === 'assistant')
    : [];
  const latest = assistants[assistants.length - 1];
  if (!latest) return '';
  return (latest.parts || [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
};

const readAssistantResponse = async (client, sessionID, directory) => {
  const records = unwrap(await client.session.messages({
    path: { id: sessionID },
    query: {
      directory,
      limit: 20,
    },
  }), 'session.messages');
  return assistantTextFromMessages(records);
};

const waitForAssistantResponse = async (client, sessionID, directory, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  let sawIdle = false;
  let idleSince = 0;

  while (Date.now() < deadline) {
    const response = await readAssistantResponse(client, sessionID, directory);
    if (response) return response;

    const statuses = unwrap(await client.session.status({
      query: { directory },
    }), 'session.status');
    const status = statuses?.[sessionID];
    if (status?.type === 'idle') {
      if (!sawIdle) {
        sawIdle = true;
        idleSince = Date.now();
      } else if (Date.now() - idleSince >= POLL_INTERVAL_MS * 2) {
        return '';
      }
    } else if (status) {
      sawIdle = false;
      idleSince = 0;
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for councillor session`);
};

const runCouncillor = async ({ client, context, prompt, councillor, index, timeoutMs }) => {
  const parsed = parseModelRef(councillor.model);
  const variant = normalizeVariant(councillor.variant);
  const modelLabel = formatModelLabel({ model: councillor.model, variant });
  const name = `Councillor ${index + 1} (${modelLabel})`;
  if (!parsed) {
    return { name, status: 'failed', response: `Invalid model ref: ${councillor.model}` };
  }

  const parentID = typeof context.sessionID === 'string' && context.sessionID.trim()
    ? context.sessionID.trim()
    : undefined;

  const session = unwrap(await client.session.create({
    query: { directory: context.directory },
    body: {
      title: `Counsellor ${index + 1}: ${modelLabel}`,
      ...(parentID ? { parentID } : {}),
    },
  }), 'session.create');

  await client.session.promptAsync({
    path: { id: session.id },
    query: { directory: context.directory },
    body: {
      agent: DEFAULT_COUNCIL_AGENT,
      model: parsed,
      ...(variant ? { variant } : {}),
      tools: {
        council_session: false,
        question: false,
      },
      parts: [{
        type: 'text',
        text: [
          'You are one councillor in a multi-model council.',
          'Answer independently and concisely. Do not ask follow-up questions.',
          'State assumptions and uncertainty when needed.',
          '',
          prompt,
        ].join('\n'),
      }],
    },
  }, { throwOnError: false }).then((result) => unwrap(result, 'session.promptAsync', { allowEmpty: true }));

  const response = await waitForAssistantResponse(client, session.id, context.directory, timeoutMs);
  return {
    name,
    status: response ? 'completed' : 'failed',
    response: response || 'No assistant response was recorded.',
  };
};

export const CouncilSessionPlugin = async ({ client }) => ({
  tool: {
    council_session: tool({
      description: 'Run the prompt through the configured Council councillor models and return their independent responses for synthesis.',
      args: {
        prompt: tool.schema.string().describe('The full user prompt and context to send to each councillor.'),
        preset: tool.schema.string().optional().describe('Council preset name. Defaults to "default".'),
      },
      async execute(args, context) {
        const prompt = String(args.prompt || '').trim();
        if (!prompt) {
          return 'Council session failed: prompt is required.';
        }

        const preset = String(args.preset || DEFAULT_PRESET).trim() || DEFAULT_PRESET;
        const councillors = await listCouncilModels(client, context.directory);
        if (councillors.length === 0) {
          return 'Council session failed: no councillor models are configured for the council agent.';
        }

        const settled = await Promise.allSettled(councillors.map((councillor, index) => runCouncillor({
          client,
          context,
          prompt,
          councillor,
          index,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        })));

        const results = settled.map((result, index) => (
          result.status === 'fulfilled'
            ? result.value
            : {
              name: `Councillor ${index + 1} (${councillors[index]?.model || 'unknown'})`,
              status: 'failed',
              response: result.reason instanceof Error ? result.reason.message : String(result.reason),
            }
        ));

        return [
          `Council session preset: ${preset}`,
          `Councillors requested: ${councillors.length}`,
          '',
          ...results.flatMap((result) => [
            `### ${result.name}`,
            `Status: ${result.status}`,
            result.response,
            '',
          ]),
        ].join('\n').trim();
      },
    }),
  },
});
