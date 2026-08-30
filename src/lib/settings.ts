import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'weak_app.settings.v1';

export type AppSettings = {
  serverHost: string;
  serverPort: string;
  speechRate: number;
};

function getDefaultRate(): number {
  const parsed = Number(process.env.EXPO_PUBLIC_SPEECH_RATE ?? '0.55');
  if (!Number.isFinite(parsed)) {
    return 0.55;
  }
  return Math.min(0.8, Math.max(0.4, parsed));
}

export const DEFAULT_SETTINGS: AppSettings = {
  serverHost: normalizeHost(process.env.EXPO_PUBLIC_LLAMA_HOST ?? ''),
  serverPort: (process.env.EXPO_PUBLIC_LLAMA_PORT ?? '8080').trim() || '8080',
  speechRate: getDefaultRate(),
};

// http://192.168.x.x:8080/completion のような入力でもホスト名だけを保存します。
export function normalizeHost(rawHost: string): string {
  return rawHost
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.replace(/:\d+$/, '')
    .trim() ?? '';
}

function isValidIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const value = Number(part);
    return value >= 0 && value <= 255 && String(value) === String(Number(part));
  });
}

// WindowsのIPv4アドレスを主用途としつつ、PC名や .local 名も許可します。
export function isValidServerHost(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (!host || host.length > 253) {
    return false;
  }

  if (isValidIPv4(host)) {
    return true;
  }

  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
    host,
  );
}

export function isValidPort(port: string): boolean {
  if (!/^\d+$/.test(port)) {
    return false;
  }

  const value = Number(port);
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function buildServerBaseUrl(host: string, port: string): string {
  return `http://${normalizeHost(host)}:${port}`;
}

export function buildCompletionUrl(host: string, port: string): string {
  return `${buildServerBaseUrl(host, port)}/completion`;
}

export function buildHealthUrl(host: string, port: string): string {
  return `${buildServerBaseUrl(host, port)}/health`;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      serverHost: normalizeHost(parsed.serverHost ?? DEFAULT_SETTINGS.serverHost),
      serverPort: isValidPort(parsed.serverPort ?? '')
        ? String(parsed.serverPort)
        : DEFAULT_SETTINGS.serverPort,
      speechRate:
        typeof parsed.speechRate === 'number' && Number.isFinite(parsed.speechRate)
          ? Math.min(0.8, Math.max(0.4, parsed.speechRate))
          : DEFAULT_SETTINGS.speechRate,
    };
  } catch {
    // 設定データが破損していてもアプリ自体は起動できるよう、既定値へ戻します。
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      serverHost: normalizeHost(settings.serverHost),
      serverPort: settings.serverPort,
      speechRate: settings.speechRate,
    }),
  );
}
