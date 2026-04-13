import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Linking,
} from 'react-native';
import {
  ChevronDown,
  Building2,
  ClipboardCheck,
  Package,
  Bell,
  BookOpen,
  CloudUpload,
  Settings,
  Info,
  Mail,
  HelpCircle,
  Radio,
  Link2,
  Cloud,
  MessageCircle,
  MessageSquare,
  FileSpreadsheet,
  Shield,
  Mic,
  Palette,
  User,
} from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: string[];
}

function AccordionItem({
  section,
  isExpanded,
  onToggle,
  colors,
}: {
  section: HelpSection;
  isExpanded: boolean;
  onToggle: () => void;
  colors: ThemeColors;
}) {
  const animatedHeight = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  const toggle = useCallback(() => {
    const toValue = isExpanded ? 0 : 1;
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.timing(rotateAnim, {
        toValue,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
    onToggle();
  }, [isExpanded, animatedHeight, rotateAnim, onToggle]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const maxHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2000],
  });

  const styles = useMemo(() => createItemStyles(colors), [colors]);

  return (
    <View style={styles.itemContainer}>
      <TouchableOpacity
        style={styles.itemHeader}
        onPress={toggle}
        activeOpacity={0.7}
        testID={`help-section-${section.id}`}
      >
        <View style={styles.itemIconWrap}>
          {section.icon}
        </View>
        <Text style={styles.itemTitle}>{section.title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={18} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      <Animated.View style={{ maxHeight, overflow: 'hidden' }}>
        <View style={styles.itemContent}>
          {section.content.map((line, idx) => {
            const isBullet = line.startsWith('\u2022');
            const isStep = /^\d+\./.test(line);
            const isHeader = line.endsWith(':') && !isBullet && !isStep && line.length < 60;
            return (
              <Text
                key={idx}
                style={[
                  styles.contentText,
                  (isBullet || isStep) && styles.bulletText,
                  isHeader && styles.headerText,
                ]}
              >
                {line}
              </Text>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

export default function HelpScreen() {
  const colors = useThemeColors();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const sections: HelpSection[] = useMemo(() => [
    {
      id: 'objects',
      title: 'Объекты',
      icon: <Building2 size={20} color={colors.primary} />,
      content: [
        'Объекты — ваши рабочие площадки (здания, помещения, территории).',
        '',
        'Создание объекта:',
        '1. На главном экране нажмите "+".',
        '2. Укажите название и адрес.',
        '3. Нажмите "Сохранить".',
        '',
        'Группы объектов:',
        '\u2022 Создавайте группы для удобной организации.',
        '\u2022 Перемещайте объекты между группами.',
        '\u2022 Сортируйте по алфавиту (А-Я / Я-А).',
        '',
        'Системы:',
        '\u2022 Добавляйте обслуживаемые системы в карточке объекта (СПС, СОУЭ, ВПВ и др.).',
        '\u2022 При создании записи в истории работ можно выбрать систему из списка.',
        '',
        'Контакты:',
        '\u2022 Добавляйте ответственных лиц с ФИО, должностью и телефоном.',
        '',
        'Документы:',
        '\u2022 Загружайте PDF, договоры, планы в карточку объекта.',
        '',
        'История работ:',
        '\u2022 Создавайте записи с описанием, фото и использованными материалами.',
        '\u2022 Указывайте систему, к которой относится работа.',
        '\u2022 Материалы автоматически списываются со склада.',
        '\u2022 К каждой записи можно оставлять комментарии.',
      ],
    },
    {
      id: 'inventory',
      title: 'Склад',
      icon: <Package size={20} color={colors.warning} />,
      content: [
        'Учет материалов, инструментов и расходников.',
        '',
        'Добавление:',
        '1. Вкладка "Склад" — нажмите "+".',
        '2. Укажите название, единицу измерения, количество и мин. запас.',
        '',
        'Категории:',
        '\u2022 Создавайте категории (Датчики, Батарейки, Кабель и т.д.).',
        '\u2022 Назначайте категорию при создании или через редактирование.',
        '\u2022 Материалы отображаются в раскрывающихся блоках по категориям.',
        '',
        'Поиск и сортировка:',
        '\u2022 Строка поиска для быстрого нахождения.',
        '\u2022 Переключайте сортировку А-Я / Я-А.',
        '',
        'Списание:',
        '\u2022 При создании записи в истории объекта укажите материалы.',
        '\u2022 Количество автоматически уменьшается.',
        '\u2022 Предупреждение при низком остатке.',
        '\u2022 К материалам можно оставлять комментарии.',
      ],
    },
    {
      id: 'reminders',
      title: 'Задачи и напоминания',
      icon: <Bell size={20} color={colors.info} />,
      content: [
        'Задачи с привязкой к дате и объекту.',
        '',
        'Создание:',
        '1. Вкладка "Задачи" — раздел "Напоминания" — нажмите "+".',
        '2. Заполните описание задачи.',
        '3. При необходимости укажите дату выполнения.',
        '4. Привяжите к объекту (выбор из списка).',
        '',
        'Задачи без даты:',
        '\u2022 Дата необязательна — задача будет отображаться как "без срока".',
        '\u2022 Отмечайте выполненной вручную.',
        '',
        'Уведомления:',
        '\u2022 Push-уведомления в назначенное время (если указана дата).',
        '\u2022 К задачам можно оставлять комментарии.',
      ],
    },
    {
      id: 'checklists',
      title: 'Чек-листы',
      icon: <ClipboardCheck size={20} color={colors.success} />,
      content: [
        'Контроль качества работ по стандартным процедурам.',
        '',
        'Создание шаблона:',
        '1. Вкладка "Задачи" — раздел "Чек-листы".',
        '2. Нажмите "+", добавьте название и пункты проверки.',
        '',
        'Выполнение:',
        '1. Откройте объект — "Запустить чек-лист".',
        '2. Отмечайте пункты, добавляйте комментарии.',
        '',
        'Результаты сохраняются в истории объекта.',
      ],
    },
    {
      id: 'knowledge',
      title: 'База знаний',
      icon: <BookOpen size={20} color={colors.secondary} />,
      content: [
        'Хранение инструкций, нормативов и справочных материалов.',
        '',
        'Категории:',
        '\u2022 Создавайте свои категории (Инструкции, Схемы, Нормативы и т.д.).',
        '\u2022 Переименовывайте и удаляйте категории.',
        '\u2022 Перемещайте файлы между категориями.',
        '',
        'Добавление:',
        '1. Нажмите иконку файла — загрузите PDF, JPEG или другой документ.',
        '2. Нажмите "+" — создайте текстовую заметку.',
        '3. Выберите категорию при добавлении.',
        '',
        'Поиск:',
        '\u2022 Строка поиска для быстрого нахождения.',
        '\u2022 Категории отображаются раскрывающимися блоками.',
      ],
    },
    {
      id: 'comments',
      title: 'Комментарии',
      icon: <MessageCircle size={20} color="#FF9800" />,
      content: [
        'Обсуждение записей прямо в приложении.',
        '',
        'Где доступны:',
        '\u2022 Записи в истории работ объектов.',
        '\u2022 Материалы на складе.',
        '\u2022 Задачи и напоминания.',
        '',
        'Использование:',
        '1. Откройте нужную запись.',
        '2. Внизу будет блок "Комментарии" с количеством.',
        '3. Нажмите — откроется панель с комментариями.',
        '4. Напишите комментарий и отправьте.',
        '',
        'Отображаемое имя:',
        '\u2022 Задайте ваше имя в Настройках → Профиль.',
        '\u2022 Имя будет видно в комментариях вместо анонимного.',
        '',
        'Уведомления:',
        '\u2022 Новые комментарии отображаются в центре уведомлений (колокольчик).',
        '\u2022 Непрочитанные комментарии выделяются счётчиком.',
      ],
    },
    {
      id: 'chats',
      title: 'Чаты',
      icon: <MessageSquare size={20} color="#00BCD4" />,
      content: [
        'Обмен сообщениями между мастером и подписчиками.',
        '',
        'Доступ:',
        '\u2022 Центр уведомлений (колокольчик) — вкладка "Чаты".',
        '\u2022 Нажмите "+" для создания нового чата.',
        '',
        'Возможности:',
        '\u2022 Отправка текстовых сообщений.',
        '\u2022 Сообщения отображаются с именем отправителя и временем.',
        '\u2022 Чаты привязаны к подпискам — общение мастера с подписчиком.',
        '',
        'Условия:',
        '\u2022 Для отправки сообщений необходим подписчик.',
        '\u2022 Сообщения доступны только участникам чата.',
      ],
    },
    {
      id: 'backup',
      title: 'Яндекс.Диск и бэкапы',
      icon: <CloudUpload size={20} color="#9C27B0" />,
      content: [
        'Защита данных от потери через Яндекс.Диск.',
        '',
        'Подключение:',
        '1. Настройки → Синхронизация и подписки.',
        '2. Нажмите "Войти через Яндекс".',
        '',
        'Операции:',
        '\u2022 "Создать бэкап" — все данные загружаются на Диск.',
        '\u2022 "Восстановить" — выберите копию из списка.',
        '\u2022 Авто-бэкап по расписанию (каждый час, 12ч, 24ч).',
        '',
        'Управление аккаунтом:',
        '\u2022 Сменить аккаунт или выйти можно в настройках.',
        '\u2022 При смене аккаунта настройки мастера сбрасываются.',
      ],
    },
    {
      id: 'master',
      title: 'Режим мастера',
      icon: <Radio size={20} color={colors.success} />,
      content: [
        'Публикация данных для подписчиков через Яндекс.Диск.',
        '',
        'Настройка:',
        '1. Подключите Яндекс.Диск в разделе "Синхронизация и подписки".',
        '2. Откройте "Режим мастера" и включите его.',
        '3. Данные будут опубликованы, вы получите ссылку и QR-код.',
        '',
        'Публикация:',
        '\u2022 Кнопка "Опубликовать сейчас" — мгновенная публикация.',
        '\u2022 Авто-публикация: каждый час, 12ч или 24ч.',
        '\u2022 "Сбросить и начать заново" — перезаписать данные на Диске текущими.',
        '',
        'Ссылка и QR-код:',
        '\u2022 Публичная ссылка доступна для копирования.',
        '\u2022 QR-код для быстрого подключения подписчика.',
        '',
        'Авто-синхронизация мастера:',
        '\u2022 Проверяет свой публичный бэкап и восстанавливает при необходимости.',
        '\u2022 Интервал настраивается отдельно.',
        '',
        'Подписчики:',
        '\u2022 Список подписчиков отображается в разделе "Режим мастера".',
        '\u2022 Подписчики регистрируются автоматически при добавлении ссылки.',
        '\u2022 Видно имя подписчика и дату подключения.',
      ],
    },
    {
      id: 'subscriber',
      title: 'Режим подписчика',
      icon: <Link2 size={20} color={colors.info} />,
      content: [
        'Получение данных от мастеров через ссылку на Яндекс.Диск.',
        '',
        'Добавление подписки:',
        '1. Настройки → Синхронизация и подписки → "Подписки на мастеров".',
        '2. Нажмите "+" для добавления.',
        '3. Укажите ваше имя (видно мастеру для идентификации).',
        '4. Введите название подписки (например: Имя мастера).',
        '5. Вставьте ссылку от мастера или отсканируйте QR-код.',
        '',
        'Автоматическая регистрация:',
        '\u2022 При добавлении подписки вы автоматически регистрируетесь у мастера.',
        '\u2022 Мастер видит ваше имя в своём списке подписчиков.',
        '',
        'Управление:',
        '\u2022 Переключение между подписками — через иконку облака (плавающая кнопка).',
        '\u2022 Автопроверка обновлений по расписанию (час, 12ч, 24ч).',
        '\u2022 Кнопка "Проверить сейчас" для ручной синхронизации.',
        '\u2022 Переименование и удаление подписок.',
        '',
        'Данные подписчика:',
        '\u2022 Полученные данные — только для чтения.',
      ],
    },
    {
      id: 'syncpanel',
      title: 'Панель синхронизации',
      icon: <Cloud size={20} color={colors.primary} />,
      content: [
        'Быстрый доступ к синхронизации прямо с любого экрана.',
        '',
        'Как открыть:',
        '\u2022 Нажмите плавающую кнопку с иконкой облака.',
        '',
        'Возможности панели:',
        '\u2022 Текущий профиль и переключение между профилями.',
        '\u2022 Кнопка обновления данных (скачать из облака).',
        '\u2022 Кнопка публикации (загрузить в облако).',
        '\u2022 Копирование публичной ссылки и показ QR-кода.',
        '\u2022 Выбор интервала авто-синхронизации.',
      ],
    },
    {
      id: 'voice',
      title: 'Голосовой ввод',
      icon: <Mic size={20} color="#E91E63" />,
      content: [
        'Быстрый ввод текста голосом.',
        '',
        'Использование:',
        '1. Нажмите иконку микрофона рядом с полем ввода.',
        '2. Говорите — речь будет записана.',
        '3. После окончания записи текст автоматически распознаётся.',
        '4. Результат вставляется в поле ввода.',
        '',
        '\u2022 Доступно при создании записей, комментариев и заметок.',
      ],
    },
    {
      id: 'excel',
      title: 'Экспорт и импорт данных',
      icon: <FileSpreadsheet size={20} color="#1B8A5A" />,
      content: [
        'Работа с данными в формате Excel.',
        '',
        'Как открыть:',
        '\u2022 Настройки → Экспорт / Импорт.',
        '',
        'Экспорт:',
        '\u2022 Выгрузка объектов, контактов, истории работ, материалов, чек-листов, задач и базы знаний в Excel-файл.',
        '',
        'Импорт:',
        '\u2022 Загрузка данных из Excel-файла обратно в приложение.',
        '\u2022 Полезно для переноса данных или массового добавления.',
      ],
    },
    {
      id: 'notifications',
      title: 'Центр уведомлений',
      icon: <Bell size={20} color="#FF5722" />,
      content: [
        'Все уведомления и чаты в одном месте.',
        '',
        'Как открыть:',
        '\u2022 Нажмите иконку колокольчика в правом верхнем углу.',
        '',
        'Содержимое:',
        '\u2022 Непрочитанные комментарии к записям работ, складу и задачам.',
        '\u2022 Вкладка "Чаты" для перехода к диалогам.',
        '',
        '\u2022 Красный счётчик на колокольчике показывает количество непрочитанных.',
        '\u2022 Нажатие на уведомление открывает соответствующую запись.',
      ],
    },
    {
      id: 'settings',
      title: 'Настройки и безопасность',
      icon: <Settings size={20} color={colors.textSecondary} />,
      content: [
        'Профиль:',
        '\u2022 Имя задаётся только в режиме мастера.',
        '\u2022 Имя подписчика задаётся при добавлении подписки.',
        '',
        'PIN-код:',
        '\u2022 Устанавливается при первом запуске.',
        '\u2022 Можно включить/отключить запрос PIN при входе.',
        '\u2022 Изменение PIN через раздел "Безопасность".',
        '',
        'Биометрия (Face ID / Touch ID):',
        '\u2022 Доступно на устройствах с поддержкой биометрии.',
        '\u2022 Включается в разделе "Безопасность" при наличии PIN-кода.',
        '',
        'Тема оформления:',
        '\u2022 Выберите одну из тем: тёмная, океан, изумруд, полночь, светлая.',
        '',
        'Журнал ошибок:',
        '\u2022 Просмотр логов и предупреждений для диагностики.',
        '',
        'Блокировка приложения:',
        '\u2022 Кнопка "Заблокировать" возвращает на экран ввода PIN.',
      ],
    },
  ], [colors]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleEmailPress = useCallback(() => {
    void Linking.openURL('mailto:klemeshov2@gmail.com');
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      testID="help-screen"
    >
      <View style={styles.introCard}>
        <View style={styles.introIconWrap}>
          <HelpCircle size={28} color={colors.primary} />
        </View>
        <Text style={styles.introTitle}>Журнал мастера</Text>
        <Text style={styles.introText}>
          Управление объектами, контроль работ, учёт материалов, синхронизация данных между устройствами и организация задач. Все данные хранятся на устройстве с возможностью облачного резервного копирования через Яндекс.Диск.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Основные разделы</Text>

      {sections.slice(0, 5).map(section => (
        <AccordionItem
          key={section.id}
          section={section}
          isExpanded={expandedId === section.id}
          onToggle={() => handleToggle(section.id)}
          colors={colors}
        />
      ))}

      <Text style={styles.sectionLabel}>Общение</Text>

      {sections.slice(5, 7).map(section => (
        <AccordionItem
          key={section.id}
          section={section}
          isExpanded={expandedId === section.id}
          onToggle={() => handleToggle(section.id)}
          colors={colors}
        />
      ))}

      <Text style={styles.sectionLabel}>Синхронизация</Text>

      {sections.slice(7, 11).map(section => (
        <AccordionItem
          key={section.id}
          section={section}
          isExpanded={expandedId === section.id}
          onToggle={() => handleToggle(section.id)}
          colors={colors}
        />
      ))}

      <Text style={styles.sectionLabel}>Дополнительно</Text>

      {sections.slice(11).map(section => (
        <AccordionItem
          key={section.id}
          section={section}
          isExpanded={expandedId === section.id}
          onToggle={() => handleToggle(section.id)}
          colors={colors}
        />
      ))}

      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Обратная связь</Text>
        <Text style={styles.contactText}>
          Вопросы, предложения или сообщения об ошибках:
        </Text>
        <TouchableOpacity style={styles.emailRow} onPress={handleEmailPress} activeOpacity={0.7}>
          <Mail size={18} color={colors.primary} />
          <Text style={styles.emailText}>klemeshov2@gmail.com</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.versionCard}>
        <View style={styles.versionRow}>
          <Info size={16} color={colors.textMuted} />
          <Text style={styles.versionLabel}>Версия приложения</Text>
        </View>
        <Text style={styles.versionValue}>1.3</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 100,
    },
    introCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center' as const,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    introIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + '15',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: 12,
    },
    introTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 8,
    },
    introText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center' as const,
      lineHeight: 20,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      marginBottom: 12,
      marginTop: 8,
    },
    contactCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      padding: 20,
      marginTop: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    contactTitle: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 6,
    },
    contactText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 20,
    },
    emailRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      backgroundColor: colors.primary + '12',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    emailText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.primary,
    },
    versionCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      padding: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    versionRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    versionLabel: {
      fontSize: 14,
      color: colors.textMuted,
    },
    versionValue: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textSecondary,
    },
  });
}

function createItemStyles(colors: ThemeColors) {
  return StyleSheet.create({
    itemContainer: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
    },
    itemHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: 14,
    },
    itemIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 12,
    },
    itemTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.text,
    },
    itemContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 2,
    },
    contentText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 21,
      marginBottom: 2,
    },
    bulletText: {
      paddingLeft: 8,
    },
    headerText: {
      fontWeight: '600' as const,
      color: colors.text,
      marginTop: 4,
    },
  });
}
