# OpenCode Notify

Уведомления для **OpenCode v1**, запущенного локально, через VS Code Remote SSH,
WSL или Dev Containers. Уведомления появляются на компьютере с VS Code:
в редакторе, когда он активен, и в системе, когда вы переключились в другое окно.

## Возможности

- Завершение ответа, вопрос, запрос разрешения и ошибка агента.
- Отмена через ESC не считается успешным завершением.
- Завершения субагентов отключены по умолчанию; их вопросы и разрешения приходят.
- Настройки событий, звука, места показа и минимальной длительности завершённого запуска.
- Название проекта и сессии в уведомлении; переход к терминалу из VS Code.
- Независимое соединение для каждого окна VS Code, без публичных портов и стороннего сервиса.
- Команда `opencode-notify` для собственных скриптов.

## Установка из VSIX

Скачайте два файла из [GitHub Releases](https://github.com/BuckanovNikita/opencode-notify/releases):

| Файл | Где установить |
| --- | --- |
| `opencode-notify-0.1.0.vsix` | Локальный VS Code, раздел **Local — Installed** |
| `opencode-notify-router-0.1.0.vsix` | Хост рабочей области: SSH, WSL, контейнер или локальная машина |

Выполните **Extensions: Install from VSIX...**. При удалённой работе проверьте
расположение каждого расширения в панели Extensions: интерфейсное расширение
должно работать локально, Router — на хосте рабочей области. В обычной локальной
рабочей области установите оба расширения локально. VS Code Marketplace не нужен.

Затем в подключённом окне:

1. Выполните **OpenCode Notify: Install or Update OpenCode v1 Plugin**.
2. Выполните **OpenCode Notify: Test Connection**.
3. Закройте старый терминал OpenCode и откройте новый либо выполните
   **OpenCode Notify: Start OpenCode**.

Установщик копирует автономный плагин в
`~/.config/opencode/plugins/opencode-notify.js`, учитывая `XDG_CONFIG_HOME`.
Другие плагины и `opencode.json` не меняются. Для замены существующего изменённого
файла требуется подтверждение. Перезапустите OpenCode после установки или обновления.
Отключите старый плагин уведомлений, если он уже отправляет такие же события.

## Настройки VS Code

Настройки применяются к локальному показу уведомлений:

```json
{
  "opencodeNotify.systemNotifications": "auto",
  "opencodeNotify.sound": true,
  "opencodeNotify.enabled": true,
  "opencodeNotify.events.complete": true,
  "opencodeNotify.events.question": true,
  "opencodeNotify.events.permission": true,
  "opencodeNotify.events.error": true
}
```

`systemNotifications`: `auto` — по фокусу окна, `app` — только VS Code,
`system` — системные уведомления с резервным показом в VS Code при ошибке.
Звук запрашивается для системных уведомлений; его поддержка зависит от ОС.

## Настройки плагина OpenCode v1

Создайте на хосте OpenCode файл `~/.config/opencode/opencode-notify.json`
(или `$XDG_CONFIG_HOME/opencode/opencode-notify.json`):

```json
{
  "enabled": true,
  "showProjectName": true,
  "showSessionTitle": true,
  "minDurationMs": 10000,
  "display": "auto",
  "events": {
    "complete": true,
    "question": true,
    "permission": true,
    "error": true,
    "subagent_complete": false
  }
}
```

Все поля необязательны. По умолчанию `minDurationMs` равен `0`. Порог действует
только на завершение, поэтому короткий запрос разрешения или вопрос не потеряется.
`display` предлагает место показа только при локальном режиме `auto`.
После изменения файла перезапустите OpenCode. Некорректная конфигурация отключает
плагин и записывает причину в журнал OpenCode.

## Скрипты и несколько сессий

В новом терминале VS Code доступна команда:

```bash
opencode-notify "Сборка завершена"
opencode-notify -d system "Обучение" "Модель готова"
opencode-notify -d app "Тесты" "Все проверки пройдены"
```

Router передаёт терминалам `OPENCODE_NOTIFY_URL` и `OPENCODE_NOTIFY_TOKEN`.
Запускайте каждую сессию из нужного окна VS Code; не копируйте эти значения между
окнами. Уже работающие процессы и старые серверы tmux не получают новое окружение
автоматически. После перезагрузки окна откройте свежий терминал и перезапустите
OpenCode. Для фонового процесса сохраните окружение его исходного терминала.

**Start OpenCode** дополнительно связывает терминал с уведомлениями: кнопка
**Open terminal** открывает его. Для обычных терминалов, когда их несколько,
предлагается выбор. Вопрос или разрешение нужно обработать в самом OpenCode.

## Совместимость и ограничения

- VS Code 1.93 или новее; настольный клиент. Браузерный vscode.dev не поддерживается.
- OpenCode v1 с событиями `session.status`, `message.updated` и `question.asked`.
  Поддержаны обе формы разрешений: `permission.updated` и `permission.asked`.
  OpenCode v2 не поддерживается.
- «Завершение» означает успешное окончание ответа/запуска, а не закрытие процесса.
- Окно VS Code и удалённое соединение должны оставаться открытыми. Доставки после
  отключения и постоянной очереди уведомлений нет.
- Windows использует встроенный SnoreToast. На macOS комплектный помощник
  `terminal-notifier` требует Rosetta на Apple Silicon. На Linux нужен локальный
  `notify-send` и работающая служба уведомлений рабочего стола.
- Linux-звук зависит от рабочего стола; переход из системного уведомления на Linux
  не реализован. Кнопка перехода в уведомлениях VS Code работает на всех платформах.
- ОС может скрыть уведомления из-за режима «Не беспокоить» или своих разрешений;
  успешный запуск помощника не доказывает, что пользователь увидел уведомление.

## Если уведомления не приходят

1. Проверьте установку обоих VSIX на правильных хостах.
2. Выполните **OpenCode Notify: Test Connection**.
3. Откройте **Output → OpenCode Notify Router** и **Output → OpenCode Notify**.
4. Используйте новый терминал после установки/перезагрузки окна.
5. Проверьте настройку `opencodeNotify.enabled`, настройки событий и разрешения ОС.
6. Посмотрите журнал OpenCode: ошибки плагина имеют имя сервиса `opencode-notify`.

Для удаления отключите оба расширения и удалите только установленный файл
`opencode-notify.js` из каталога плагинов OpenCode. Конфигурацию можно сохранить.

## Разработка

Нужен Node.js 22 или новее:

```bash
npm ci --ignore-scripts
npm run check
npm run package
npm run test:native
xvfb-run -a npm run test:extension
```

VSIX-файлы и контрольные суммы находятся в `artifacts/`; автономный плагин —
в `dist/opencode-notify.js`. Подробности: [development guide](docs/development.md),
[design](docs/superpowers/specs/2026-10-26-notifications-design.md),
[implementation plan](docs/superpowers/plans/2026-10-26-notifications.md).
