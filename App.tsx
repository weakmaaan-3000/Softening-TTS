import React, { useEffect, useMemo, useState } from 'react';
import * as Speech from 'expo-speech';
import Slider from '@react-native-community/slider';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from './src/components/ActionButton';
import {
  AppStatus,
  StatusIndicator,
} from './src/components/StatusIndicator';
import {
  DEFAULT_SETTINGS,
  AppSettings,
  buildCompletionUrl,
  isValidPort,
  isValidServerHost,
  loadSettings,
  normalizeHost,
  saveSettings,
} from './src/lib/settings';
import {
  LlamaClientError,
  requestPoliteRewrite,
  testServerConnection,
} from './src/lib/llama';

type Screen = 'main' | 'settings';

function speakJapanese(text: string, rate: number, onError?: () => void) {
  if (!text.trim()) {
    return;
  }

  // 前の読み上げキューを残さず、最新の文章だけを読み上げます。
  void Speech.stop().finally(() => {
    Speech.speak(text, {
      language: 'ja-JP',
      rate,
      pitch: 1.0,
      onError,
    });
  });
}

function AppContent() {
  const [screen, setScreen] = useState<Screen>('main');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] =
    useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);

  const [inputText, setInputText] = useState('');
  const [resultText, setResultText] = useState('');
  const [status, setStatus] = useState<AppStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsNotice, setSettingsNotice] = useState('');

  useEffect(() => {
    let mounted = true;

    void loadSettings().then((loaded) => {
      if (!mounted) {
        return;
      }
      setSettings(loaded);
      setDraftSettings(loaded);
      setSettingsReady(true);
    });

    return () => {
      mounted = false;
      void Speech.stop();
    };
  }, []);

  const endpoint = useMemo(
    () =>
      settings.serverHost
        ? buildCompletionUrl(settings.serverHost, settings.serverPort)
        : '未設定',
    [settings.serverHost, settings.serverPort],
  );

  const handleTransform = async () => {
    const trimmed = inputText.trim();

    if (!trimmed) {
      setStatus('error');
      setErrorMessage('変換したい文章を入力してください。');
      return;
    }

    setIsConverting(true);
    setStatus('converting');
    setErrorMessage('');
    await Speech.stop();

    try {
      const converted = await requestPoliteRewrite({
        serverHost: settings.serverHost,
        serverPort: settings.serverPort,
        inputText: trimmed,
      });

      setResultText(converted);
      setStatus('complete');

      // 仕様に合わせ、変換完了後に自動で読み上げます。
      speakJapanese(converted, settings.speechRate, () => {
        setErrorMessage(
          '読み上げに失敗しました。iPhoneの消音モードや音声設定をご確認ください。',
        );
      });
    } catch (error) {
      setStatus('error');

      if (error instanceof LlamaClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('予期しないエラーが発生しました。もう一度お試しください。');
      }
    } finally {
      setIsConverting(false);
    }
  };

  const handleSpeak = () => {
    if (!resultText.trim()) {
      return;
    }

    speakJapanese(resultText, settings.speechRate, () => {
      setStatus('error');
      setErrorMessage(
        '読み上げに失敗しました。iPhoneの消音モードや音声設定をご確認ください。',
      );
    });
  };

  const updateSpeechRatePreview = (value: number) => {
    setSettings((current) => ({ ...current, speechRate: value }));
    setDraftSettings((current) => ({ ...current, speechRate: value }));
  };

  const persistSpeechRate = (value: number) => {
    const next = { ...settings, speechRate: value };
    setSettings(next);
    setDraftSettings(next);

    // ドラッグ完了時だけ保存し、連続したストレージ書き込みを避けます。
    void saveSettings(next).catch(() => {
      setStatus('error');
      setErrorMessage('読み上げ速度を端末へ保存できませんでした。');
    });
  };

  const openSettings = () => {
    setDraftSettings(settings);
    setSettingsError('');
    setSettingsNotice('');
    setScreen('settings');
  };

  const handleSaveSettings = async () => {
    const host = normalizeHost(draftSettings.serverHost);
    const port = draftSettings.serverPort.trim();

    if (!isValidServerHost(host)) {
      setSettingsError('Windows PCのIPアドレスまたはホスト名を正しく入力してください。');
      setSettingsNotice('');
      return;
    }

    if (!isValidPort(port)) {
      setSettingsError('ポート番号は1〜65535の整数で入力してください。');
      setSettingsNotice('');
      return;
    }

    const next: AppSettings = {
      serverHost: host,
      serverPort: port,
      speechRate: draftSettings.speechRate,
    };

    try {
      await saveSettings(next);
      setSettings(next);
      setDraftSettings(next);
      setErrorMessage('');
      setSettingsError('');
      setSettingsNotice('');
      setStatus('idle');
      setScreen('main');
    } catch {
      setSettingsError('設定を端末へ保存できませんでした。');
      setSettingsNotice('');
    }
  };

  const handleTestConnection = async () => {
    const host = normalizeHost(draftSettings.serverHost);
    const port = draftSettings.serverPort.trim();

    if (!isValidServerHost(host)) {
      setSettingsError('Windows PCのIPアドレスまたはホスト名を正しく入力してください。');
      setSettingsNotice('');
      return;
    }

    if (!isValidPort(port)) {
      setSettingsError('ポート番号は1〜65535の整数で入力してください。');
      setSettingsNotice('');
      return;
    }

    setIsTestingConnection(true);
    setSettingsError('');
    setSettingsNotice('');

    try {
      await testServerConnection({ serverHost: host, serverPort: port });
      setSettingsNotice('接続できました。llama.cppサーバーは応答しています。');
    } catch (error) {
      setSettingsError(
        error instanceof LlamaClientError
          ? error.message
          : '接続確認中に予期しないエラーが発生しました。',
      );
    } finally {
      setIsTestingConnection(false);
    }
  };

  if (!settingsReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#1F4B7A" />
          <Text style={styles.loadingText}>設定を読み込んでいます…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'settings') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.settingsContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setScreen('main')}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>‹ 戻る</Text>
              </Pressable>
              <Text style={styles.headerTitle}>接続設定</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Windows PCのIPアドレス</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                onChangeText={(value) =>
                  setDraftSettings((current) => ({
                    ...current,
                    serverHost: value,
                  }))
                }
                placeholder="例: 192.168.1.100"
                returnKeyType="next"
                style={styles.singleLineInput}
                value={draftSettings.serverHost}
              />

              <Text style={[styles.label, styles.labelSpacing]}>ポート</Text>
              <TextInput
                keyboardType="number-pad"
                maxLength={5}
                onChangeText={(value) =>
                  setDraftSettings((current) => ({
                    ...current,
                    serverPort: value,
                  }))
                }
                placeholder="8080"
                style={styles.singleLineInput}
                value={draftSettings.serverPort}
              />

              <Text style={styles.helpText}>
                iPhoneとWindows PCを同じLANに接続し、llama-serverを
                --host 0.0.0.0 で起動してください。
              </Text>

              <ActionButton
                label="接続を確認"
                loading={isTestingConnection}
                onPress={handleTestConnection}
                variant="secondary"
              />
            </View>

            {settingsError ? (
              <View style={styles.errorPanel}>
                <Text style={styles.errorTitle}>設定を確認してください</Text>
                <Text style={styles.errorText}>{settingsError}</Text>
              </View>
            ) : null}

            {settingsNotice ? (
              <View style={styles.successPanel}>
                <Text style={styles.successText}>{settingsNotice}</Text>
              </View>
            ) : null}

            <ActionButton
              disabled={isTestingConnection}
              label="設定を保存"
              onPress={handleSaveSettings}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.mainContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>やわらか変換</Text>
              <Text style={styles.subtitle}>TinySwallow + llama.cpp</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={isConverting}
              onPress={openSettings}
              style={({ pressed }) => [
                styles.settingsButton,
                pressed && styles.pressed,
                isConverting && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.settingsButtonText}>設定</Text>
            </Pressable>
          </View>

          <View style={styles.statusRow}>
            <StatusIndicator status={status} />
            <Text numberOfLines={1} style={styles.endpointText}>
              {endpoint}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>変換したい文章</Text>
            <TextInput
              editable={!isConverting}
              multiline
              onChangeText={setInputText}
              placeholder="ここに文章を入力してください"
              style={styles.textArea}
              textAlignVertical="top"
              value={inputText}
            />

            <ActionButton
              disabled={!inputText.trim() || !settings.serverHost}
              label="変換"
              loading={isConverting}
              onPress={handleTransform}
            />
          </View>

          {isConverting ? (
            <View style={styles.progressPanel}>
              <ActivityIndicator color="#1F4B7A" />
              <Text style={styles.progressText}>
                Windows PCで文章を変換しています…
              </Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorTitle}>確認してください</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Text style={styles.retryText}>
                タイムアウトや一時的な通信エラーの場合は、PC側の状態を確認してから「変換」をもう一度押してください。
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.label}>変換結果</Text>
            <View style={styles.resultBox}>
              <ScrollView nestedScrollEnabled>
                <Text style={resultText ? styles.resultText : styles.placeholderText}>
                  {resultText || '変換結果がここに表示されます。'}
                </Text>
              </ScrollView>
            </View>

            <ActionButton
              disabled={!resultText || isConverting}
              label="読み上げ"
              onPress={handleSpeak}
              variant="secondary"
            />

            <View style={styles.rateHeader}>
              <Text style={styles.label}>読み上げ速度</Text>
              <Text style={styles.rateValue}>
                {settings.speechRate.toFixed(2)}
              </Text>
            </View>
            <Slider
              accessibilityLabel="読み上げ速度"
              disabled={isConverting}
              maximumValue={0.8}
              minimumValue={0.4}
              onValueChange={updateSpeechRatePreview}
              onSlidingComplete={persistSpeechRate}
              step={0.05}
              value={settings.speechRate}
            />
            <View style={styles.rateScale}>
              <Text style={styles.scaleText}>ゆっくり 0.40</Text>
              <Text style={styles.scaleText}>速め 0.80</Text>
            </View>
          </View>

          <Text style={styles.footer}>author: dev</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8FA',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#4B5563',
    fontSize: 15,
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  settingsContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 18,
  },
  header: {
    minHeight: 52,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#17212B',
    fontSize: 25,
    fontWeight: '800',
  },
  subtitle: {
    color: '#667085',
    fontSize: 12,
    marginTop: 2,
  },
  headerTitle: {
    color: '#17212B',
    fontSize: 19,
    fontWeight: '800',
  },
  headerButton: {
    minWidth: 70,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerButtonText: {
    color: '#1F4B7A',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 70,
  },
  settingsButton: {
    minHeight: 42,
    minWidth: 62,
    borderRadius: 11,
    backgroundColor: '#E8F0F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: {
    color: '#1F4B7A',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  endpointText: {
    flex: 1,
    color: '#667085',
    fontSize: 11,
    textAlign: 'right',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 15,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCE3EA',
  },
  label: {
    color: '#25313C',
    fontSize: 14,
    fontWeight: '700',
  },
  labelSpacing: {
    marginTop: 6,
  },
  textArea: {
    minHeight: 128,
    maxHeight: 210,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FBFCFD',
    color: '#111827',
    fontSize: 16,
    lineHeight: 23,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  singleLineInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FBFCFD',
    color: '#111827',
    fontSize: 16,
    paddingHorizontal: 12,
  },
  helpText: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
  progressPanel: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#EDF4FA',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  progressText: {
    color: '#315B7D',
    fontSize: 13,
    fontWeight: '600',
  },
  successPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    padding: 12,
  },
  successText: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  errorPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
    padding: 12,
    gap: 5,
  },
  errorTitle: {
    color: '#9F1239',
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: '#881337',
    fontSize: 13,
    lineHeight: 19,
  },
  retryText: {
    color: '#9F1239',
    fontSize: 11,
    lineHeight: 17,
  },
  resultBox: {
    height: 150,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DEE7',
    backgroundColor: '#FAFBFC',
    padding: 12,
  },
  resultText: {
    color: '#17212B',
    fontSize: 16,
    lineHeight: 24,
  },
  placeholderText: {
    color: '#98A2B3',
    fontSize: 15,
    lineHeight: 22,
  },
  rateHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rateValue: {
    color: '#1F4B7A',
    fontSize: 14,
    fontWeight: '800',
  },
  rateScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleText: {
    color: '#7B8794',
    fontSize: 11,
  },
  footer: {
    color: '#98A2B3',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
});
