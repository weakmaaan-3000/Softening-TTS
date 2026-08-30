import {
  buildCompletionUrl,
  buildHealthUrl,
  isValidPort,
  isValidServerHost,
} from './settings';

const SYSTEM_PROMPT =
  'あなたは入力された文章をより丁寧で柔らかい表現に変換する専門家です。命令形は避け、敬体（です・ます調）を使い、相手への配慮を感じさせる文章に書き換えてください。変換後のテキストのみを出力してください。';

const COMPLETION_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5_000;

export type LlamaErrorCode =
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_response'
  | 'configuration';

export class LlamaClientError extends Error {
  constructor(
    public readonly code: LlamaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LlamaClientError';
  }
}

type CompletionResponse = {
  content?: unknown;
  completion?: unknown;
  choices?: Array<{ text?: unknown }>;
};

function validateConnectionSettings(serverHost: string, serverPort: string) {
  if (!isValidServerHost(serverHost)) {
    throw new LlamaClientError(
      'configuration',
      'Windows PCのIPアドレスまたはホスト名が正しくありません。',
    );
  }

  if (!isValidPort(serverPort)) {
    throw new LlamaClientError(
      'configuration',
      'ポート番号は1〜65535の整数で指定してください。',
    );
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlamaClientError('timeout', timeoutMessage);
    }

    throw new LlamaClientError(
      'network',
      'Windows PCのllama.cppサーバーに接続できません。サーバー起動、IPアドレス、同一LAN、Windowsファイアウォールを確認してください。',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPrompt(userText: string): string {
  return [
    `system: ${SYSTEM_PROMPT}`,
    `user: ${userText.trim()}`,
    'assistant:',
  ].join('\n');
}

function extractText(data: CompletionResponse): string {
  const candidates = [data.content, data.completion, data.choices?.[0]?.text];

  const content = candidates.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );

  if (!content) {
    throw new LlamaClientError(
      'invalid_response',
      'サーバーから有効な変換結果を取得できませんでした。',
    );
  }

  // モデルが役割名を返した場合のみ除去します。
  return content
    .trim()
    .replace(/^assistant\s*[:：]\s*/i, '')
    .trim();
}

function throwForHttpStatus(response: Response): never {
  if (response.status === 503) {
    throw new LlamaClientError(
      'http',
      'llama.cppは起動していますが、モデルを読み込み中です。少し待ってから再試行してください。',
    );
  }

  if (response.status === 404) {
    throw new LlamaClientError(
      'http',
      'llama.cppのエンドポイントが見つかりません。ポート番号とサーバーバージョンを確認してください。',
    );
  }

  throw new LlamaClientError(
    'http',
    `サーバーがHTTP ${response.status}を返しました。llama.cppのログを確認してください。`,
  );
}

export async function testServerConnection(params: {
  serverHost: string;
  serverPort: string;
}): Promise<void> {
  const { serverHost, serverPort } = params;
  validateConnectionSettings(serverHost, serverPort);

  const response = await fetchWithTimeout(
    buildHealthUrl(serverHost, serverPort),
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    HEALTH_TIMEOUT_MS,
    '5秒以内にサーバーへ接続できませんでした。IPアドレス、ポート、Windowsファイアウォールを確認してください。',
  );

  if (!response.ok) {
    throwForHttpStatus(response);
  }
}

export async function requestPoliteRewrite(params: {
  serverHost: string;
  serverPort: string;
  inputText: string;
}): Promise<string> {
  const { serverHost, serverPort, inputText } = params;
  validateConnectionSettings(serverHost, serverPort);

  const response = await fetchWithTimeout(
    buildCompletionUrl(serverHost, serverPort),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: buildPrompt(inputText),
        n_predict: 256,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
        stop: ['\nuser:', '\nsystem:'],
      }),
    },
    COMPLETION_TIMEOUT_MS,
    '60秒以内に応答がありませんでした。PC側の負荷を確認して、もう一度お試しください。',
  );

  if (!response.ok) {
    throwForHttpStatus(response);
  }

  let data: CompletionResponse;
  try {
    data = (await response.json()) as CompletionResponse;
  } catch {
    throw new LlamaClientError(
      'invalid_response',
      'サーバー応答をJSONとして読み取れませんでした。',
    );
  }

  return extractText(data);
}
