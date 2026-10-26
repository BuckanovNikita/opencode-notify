# OpenCode Notify

Локальный показ уведомлений OpenCode v1 в VS Code и операционной системе.
При удалённой работе это расширение устанавливается на **локальном компьютере**.
Дополнительно установите **OpenCode Notify Router** на хост рабочей области.

Оба VSIX доступны в [GitHub Releases](https://github.com/BuckanovNikita/opencode-notify/releases).
В подключённом окне выполните **OpenCode Notify: Install or Update OpenCode v1 Plugin**,
затем **OpenCode Notify: Test Connection** и откройте новый терминал OpenCode.

Режим `opencodeNotify.systemNotifications`: `auto`, `app` или `system`.
Звук управляется `opencodeNotify.sound`; каждое событие можно отключить отдельно.
При ошибке системного помощника уведомление появится в VS Code.

На Linux нужен локальный `notify-send`. На Apple Silicon комплектному помощнику
нужна Rosetta. ОС может скрывать уведомления в режиме «Не беспокоить».

Полная [инструкция](https://github.com/BuckanovNikita/opencode-notify#readme).
