# OpenCode Notify

Локальный показ уведомлений OpenCode v1/v2 в VS Code и операционной системе.
При удалённой работе это расширение устанавливается на **локальном компьютере**.
В доверенном окне расширение автоматически установит комплектный **OpenCode Notify
Router** на хост рабочей области: SSH, WSL, Dev Containers, Remote Tunnels или локально.

Оба VSIX доступны в артефактах [GitHub Actions](https://github.com/BuckanovNikita/opencode-notify/actions)
для соответствующего тега; локальная сборка — `npm run package`.
Router автоматически устанавливает отсутствующий плагин OpenCode v1/v2.
Выполните **OpenCode Notify: Test Connection** и откройте новый терминал OpenCode.
Существующий отличающийся плагин сохраняется; обновление требует команды
**OpenCode Notify: Install or Update OpenCode Plugin** и подтверждения.

Для повторной настройки: **OpenCode Notify: Set Up Workspace**. Отключение
автоустановки Router: `opencodeNotify.autoInstallRouter: false` в пользовательских
настройках. При ошибке можно установить Router VSIX вручную на хост рабочей области.
Marketplace не нужен. После обновления может потребоваться перезагрузка окна.

Режим `opencodeNotify.systemNotifications`: `both` (по умолчанию), `auto`, `app`
или `system`. Режим `both` показывает один системный баннер и уведомление
в активном доверенном окне VS Code, в том числе другом профиле этой установки.
**Open OpenCode** возвращает в исходное окно и его терминал. На Windows нажатие
в Центре уведомлений работает после исчезновения баннера, пока окно открыто.
Звук управляется `opencodeNotify.sound`; каждое событие можно отключить отдельно.
При ошибке системного помощника уведомление появится в VS Code.

На Linux нужен локальный `notify-send`. На Apple Silicon комплектному помощнику
нужна Rosetta. ОС может скрывать уведомления в режиме «Не беспокоить».

Полная [инструкция](https://github.com/BuckanovNikita/opencode-notify#readme).
