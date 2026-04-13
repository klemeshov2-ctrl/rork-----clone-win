import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  originalMessage?: string;
  stack?: string;
  timestamp: number;
  source?: string;
}

const LOGS_KEY = '@app_logs';
const MAX_LOGS = 500;

let logsCache: LogEntry[] = [];
let initialized = false;
let listeners: Array<() => void> = [];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function notifyListeners() {
  listeners.forEach(l => l());
}

const ERROR_TRANSLATIONS: Array<[RegExp, string]> = [
  [/Missing or insufficient permissions/i, 'Недостаточно прав для выполнения операции'],
  [/Network request failed/i, 'Отсутствует интернет-соединение'],
  [/Failed to fetch/i, 'Не удалось выполнить сетевой запрос. Проверьте подключение к интернету'],
  [/timeout/i, 'Превышено время ожидания запроса'],
  [/Firebase: Error \(auth\/invalid-api-key\)/i, 'Ошибка авторизации: неверный ключ API'],
  [/Firebase: Error \(auth\/user-not-found\)/i, 'Ошибка авторизации: пользователь не найден'],
  [/Firebase: Error \(auth\/wrong-password\)/i, 'Ошибка авторизации: неверный пароль'],
  [/Firebase: Error \(auth\/too-many-requests\)/i, 'Слишком много попыток входа. Попробуйте позже'],
  [/Firebase: Error \(auth\/network-request-failed\)/i, 'Ошибка сети при авторизации. Проверьте интернет'],
  [/Firebase: Error \(auth\/invalid-credential\)/i, 'Ошибка авторизации: недействительные учётные данные'],
  [/Firebase: Error \(auth\/credential-already-in-use\)/i, 'Эти учётные данные уже привязаны к другому аккаунту'],
  [/Firebase: Error \(auth\/requires-recent-login\)/i, 'Требуется повторная авторизация'],
  [/Firebase: Error/i, 'Ошибка Firebase'],
  [/Failed to upload file/i, 'Не удалось загрузить файл'],
  [/Failed to download/i, 'Не удалось скачать файл'],
  [/Document not found/i, 'Документ не найден'],
  [/PERMISSION_DENIED/i, 'Доступ запрещён'],
  [/quota.exceeded/i, 'Превышена квота хранилища'],
  [/storage\/unauthorized/i, 'Нет доступа к хранилищу'],
  [/storage\/object-not-found/i, 'Файл не найден в хранилище'],
  [/Could not connect to the server/i, 'Не удалось подключиться к серверу'],
  [/JSON Parse error/i, 'Ошибка обработки данных (некорректный формат)'],
  [/SyntaxError/i, 'Синтаксическая ошибка в данных'],
  [/TypeError: (.*) is not a function/i, 'Внутренняя ошибка приложения'],
  [/TypeError: Cannot read propert/i, 'Внутренняя ошибка: доступ к несуществующему свойству'],
  [/TypeError/i, 'Внутренняя ошибка типов данных'],
  [/ReferenceError/i, 'Внутренняя ошибка: обращение к несуществующей переменной'],
  [/RangeError/i, 'Внутренняя ошибка: значение вне допустимого диапазона'],
  [/AsyncStorage/i, 'Ошибка локального хранилища'],
  [/Disk full/i, 'Недостаточно места на устройстве'],
  [/No such file or directory/i, 'Файл или папка не найдены'],
  [/OAuth/i, 'Ошибка авторизации через внешний сервис'],
  [/token.*expired/i, 'Срок действия токена авторизации истёк'],
  [/Unauthorized/i, 'Требуется авторизация'],
  [/403/i, 'Доступ запрещён (403)'],
  [/404/i, 'Ресурс не найден (404)'],
  [/500/i, 'Внутренняя ошибка сервера (500)'],
  [/502|503|504/i, 'Сервер временно недоступен'],
  [/ERR_CONNECTION_REFUSED/i, 'Соединение отклонено сервером'],
  [/ECONNRESET/i, 'Соединение было сброшено'],
  [/ENOTFOUND/i, 'Сервер не найден'],
  [/Invariant Violation/i, 'Внутренняя ошибка компонента'],
  [/Cannot.*null/i, 'Ошибка: обращение к пустому значению'],
  [/Yandex/i, 'Ошибка сервиса Яндекс'],
  [/disk.*api/i, 'Ошибка Яндекс.Диска'],
];

export function translateErrorMessage(error: string): string {
  if (!error || error.trim() === '') return 'Неизвестная ошибка';

  for (const [pattern, translation] of ERROR_TRANSLATIONS) {
    if (pattern.test(error)) {
      return translation;
    }
  }

  return `Ошибка: ${error}`;
}

const IGNORED_PATTERNS: RegExp[] = [
  /Warning:/i,
  /WARN/i,
  /Possible Unhandled Promise/i,
  /componentWillReceiveProps/i,
  /componentWillMount/i,
  /Require cycle/i,
  /ViewPropTypes/i,
  /AsyncStorage has been extracted/i,
  /Setting a timer/i,
  /VirtualizedLists should never be nested/i,
  /Each child in a list should have a unique/i,
  /Can't perform a React state update on an unmounted/i,
  /Non-serializable values were found in the navigation state/i,
];

const LOG_IGNORED_PATTERNS: RegExp[] = [
  /^Running "main"/i,
  /^%c/,
  /Bridgeless mode is enabled/i,
  /new NativeEventEmitter/i,
  /Sending.*with no listeners/i,
  /Animated: `useNativeDriver`/i,
  /fontFamily.*is not a system font/i,
  /^Overwriting fontFamily/i,
  /EventEmitter\.removeListener/i,
  /\[DEBUG\]/,
  /expo-av.*deprecated/i,
  /expo-image-picker.*deprecated/i,
  /\[compressImage\]/i,
  /WebChannelConnection.*transport errored/i,
  /Firestore.*WebChannelConnection/i,
  /WebChannel.*transport errored/i,
  /@firebase\/firestore.*WebChannel/i,

  /\[Backup\] publishBackup: files result/i,
  /\[Backup\] Results: uploaded/i,
  /\[Backup\] File migration result/i,
  /\[Backup\] linkMasterToYandex/i,
  /\[Backup\] Some files failed to upload.*continuing/i,
  /\[Backup\] Failed to upload file.*статус 409/i,
  /\[Backup\] Failed to download file.*Failed to get public download URL/i,
  /\[YandexDisk\] Upload text file error.*409/i,
  /\[YandexDisk\] Public file download URL error.*404/i,
  /\[YandexDisk\] Public file download URL error.*DiskNotFoundError/i,
  /\[FileManager\].*migrateExistingFiles DONE/i,
  /\[compressImage\]/i,

  /\[Backup\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[YandexDisk\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[GoogleDrive\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[FileManager\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[SyncEngine\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[SyncBottomSheet\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[SyncPanel\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Excel\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Profile\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[VoiceInput\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[VoiceTask\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[VoiceObject\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[VoiceMaterial\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[VoiceMaterialEdit\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[BackupScreen\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[AccessCode\](?!.*(?:error|fail|critical|ошибка))/i,

  /\[Chat\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[ChatScreen\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Comments\](?!.*(?:error|fail|critical|ошибка))/i,

  /\[DB\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[DB Provider\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Firebase\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Auth\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Push\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Notifications\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[Badge\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[ObjectsProvider\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[TasksProvider\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[ObjectDetail\](?!.*(?:error|fail|critical|ошибка))/i,
  /\[NewEntry\](?!.*(?:error|fail|critical|ошибка))/i,

  /Messages snapshot received/,
  /messages\.length changed/,
  /loadMessages called/,
  /Unloading messages/,
  /Unmounting, unloading messages/,
  /Global messages snapshot/,
  /Global snapshot: total=/,
  /Global subscription: received/,
  /onSnapshot received \d+ (?:comments|messages)/,
  /handleGlobalDocs called/,
  /relevantMasterIds computed/,
  /activeMasterId computed/,
  /commentsUserId changed/,
  /Setting up global (?:comments|messages) (?:subscription|listener)/,
  /Setting up chats subscription/,
  /Chats snapshot received/,
  /canWriteComments/,
  /handleSend called/,
  /handleSend: sendMessage completed/,
  /sendMessage called/,
  /sendMessage normalizedMasterId/,
  /sendMessage: Adding message doc/,
  /sendMessage: Updating\/creating chat doc/,
  /Message doc added to Firestore/,
  /Message sent successfully/,
  /markChatAsRead/,
  /Failed to update chat doc \(non-critical\)/,
  /Trying onSnapshot for/,
  /Subscribing to comments for/,
  /useEffect triggered\. masterId/,
  /Loading messages for/,
  /Loading comments for/,
  /Subscribers listener useEffect triggered/,
  /effectiveMasterId computed/,
  /Subscribers snapshot for masterId/,
  /handleNewSubscribers: received/,
  /Firebase auth state changed/,
  /Firebase user authenticated/,
  /Active masterId changed/,
  /Redirect URI:/,
  /Starting sync timer/,
];

function shouldIgnore(message: string): boolean {
  return IGNORED_PATTERNS.some(p => p.test(message));
}

function shouldIgnoreLog(message: string): boolean {
  return LOG_IGNORED_PATTERNS.some(p => p.test(message));
}

function extractSource(message: string): string | undefined {
  const bracketMatch = message.match(/^\[([^\]]+)\]/);
  if (bracketMatch) return bracketMatch[1];
  return undefined;
}

function formatArgs(args: unknown[]): string {
  return args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a, null, 2); } catch { return '[object]'; }
    }
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    return typeof a === 'string' ? a : String(a);
  }).join(' ');
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logsCache));
    } catch {
      // ignore
    }
  }, 1000);
}

export async function initLogger(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const stored = await AsyncStorage.getItem(LOGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LogEntry[];
      logsCache = parsed;
    }
  } catch {
    logsCache = [];
  }

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    originalLog(...args);
    const message = formatArgs(args);
    if (shouldIgnoreLog(message)) return;
    void addLogEntry('info', message);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    const message = formatArgs(args);
    if (shouldIgnore(message) || shouldIgnoreLog(message)) return;
    void addLogEntry('warn', message);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    const message = formatArgs(args);
    if (shouldIgnore(message)) return;
    void addLogEntry('error', message);
  };
}

async function addLogEntry(level: LogLevel, message: string, stack?: string): Promise<void> {
  const source = extractSource(message);
  const displayMessage = level === 'error' ? translateErrorMessage(message) : message.slice(0, 1000);

  const entry: LogEntry = {
    id: generateId(),
    level,
    message: displayMessage,
    originalMessage: level === 'error' ? message.slice(0, 2000) : undefined,
    stack: stack?.slice(0, 2000),
    timestamp: Date.now(),
    source,
  };

  logsCache = [entry, ...logsCache].slice(0, MAX_LOGS);
  notifyListeners();
  debouncedSave();
}

export function addManualLog(level: LogLevel, message: string, source?: string): void {
  const entry: LogEntry = {
    id: generateId(),
    level,
    message,
    timestamp: Date.now(),
    source,
  };
  logsCache = [entry, ...logsCache].slice(0, MAX_LOGS);
  notifyListeners();
  debouncedSave();
}

export function getLogs(): LogEntry[] {
  return logsCache;
}

export function getLogsByLevel(level: LogLevel): LogEntry[] {
  return logsCache.filter(e => e.level === level);
}

export async function clearLogs(): Promise<void> {
  logsCache = [];
  notifyListeners();
  try {
    await AsyncStorage.removeItem(LOGS_KEY);
  } catch {
    // ignore
  }
}

export async function clearLogsByLevel(level: LogLevel): Promise<void> {
  logsCache = logsCache.filter(e => e.level !== level);
  notifyListeners();
  try {
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logsCache));
  } catch {
    // ignore
  }
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  error: 'ОШИБКА',
  warn: 'ПРЕДУПР',
  info: 'ИНФО',
  debug: 'ОТЛАДКА',
};

export function getLogsAsText(filterLevel?: LogLevel): string {
  const filtered = filterLevel ? logsCache.filter(e => e.level === filterLevel) : logsCache;
  return filtered.map(entry => {
    const date = new Date(entry.timestamp);
    const ts = `${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU')}`;
    const label = LEVEL_LABELS[entry.level] || entry.level.toUpperCase();
    const src = entry.source ? ` [${entry.source}]` : '';
    return `[${label}]${src} ${ts}\n${entry.message}${entry.originalMessage ? `\n\nОригинал: ${entry.originalMessage}` : ''}${entry.stack ? `\n${entry.stack}` : ''}`;
  }).join('\n\n---\n\n');
}
