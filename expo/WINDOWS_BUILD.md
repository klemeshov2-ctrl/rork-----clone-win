# Сборка Windows .exe версии "Журнал мастера"

## Требования

- **Node.js** 18+ (https://nodejs.org/)
- **npm** (входит в Node.js)
- **nativefier** (`npm install -g nativefier`)
- **Windows 10/11**

## Шаг 1: Установка зависимостей

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser   # только первый раз
cd C:\path\to\project\expo
npm install --legacy-peer-deps
```

## Шаг 2: Экспорт веб-версии

```powershell
npx expo export --platform web --clear
```

После выполнения появится папка `dist/` с готовыми файлами.

## Шаг 3: Проверка в браузере (опционально)

```powershell
npx serve dist
```

Откройте http://localhost:3000 в браузере и убедитесь, что приложение работает.

## Шаг 4: Сборка .exe через Nativefier

### Вариант A: Из локальных файлов через serve

Запустите в одном терминале:
```powershell
npx serve dist -l 5555
```

В другом терминале:
```powershell
nativefier "http://localhost:5555" ^
  --name "Журнал Мастера" ^
  --platform windows ^
  --arch x64 ^
  --icon ./assets/images/icon.png ^
  --single-instance ^
  --disable-context-menu ^
  --disable-dev-tools ^
  --title-bar-style hidden ^
  --width 1024 ^
  --height 768 ^
  --min-width 400 ^
  --min-height 600 ^
  --overwrite ^
  ./windows-build
```

### Вариант B: Из развернутого URL (если есть хостинг)

Если вы развернули dist/ на хостинге (Vercel, Netlify, Firebase Hosting и т.д.):

```powershell
nativefier "https://your-app-url.com" ^
  --name "Журнал Мастера" ^
  --platform windows ^
  --arch x64 ^
  --icon ./assets/images/icon.png ^
  --single-instance ^
  --overwrite ^
  ./windows-build
```

## Шаг 5: Запуск

После сборки готовый .exe будет в папке:
```
./windows-build/Журнал Мастера-win32-x64/Журнал Мастера.exe
```

## Известные ограничения Windows-версии

| Функция | Статус |
|---|---|
| Чат (Firebase) | Работает |
| Комментарии | Работают |
| Синхронизация Firebase | Работает |
| Яндекс.Диск | Работает |
| Вход по PIN-коду | Работает |
| Биометрия (отпечаток/Face ID) | Отключена |
| Push-уведомления | Отключены |
| Камера | Отключена |
| Выбор фото | Отключен |
| SQLite | Заменен на localStorage |

## Устранение неполадок

### Белый экран после запуска
- Убедитесь, что `npx expo export --platform web --clear` завершился без ошибок
- Проверьте что `dist/index.html` существует и содержит `<meta charset="UTF-8">`
- Попробуйте вариант B (через URL) вместо локальных файлов

### Кракозябры вместо русского текста
- Убедитесь, что файлы экспортированы в UTF-8
- Проверьте наличие мета-тега `<meta charset="UTF-8">` в dist/index.html

### Ошибки Firebase
- Убедитесь, что у вас есть доступ к интернету
- Проверьте Firebase конфигурацию в app.json → extra → firebase
