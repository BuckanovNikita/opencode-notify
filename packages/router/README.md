# OpenCode Notify Router

Мост между OpenCode v1 на хосте рабочей области и локальным VS Code.
Локальное расширение **OpenCode Notify** автоматически устанавливает Router
в доверенную рабочую область: SSH, WSL, контейнер, Remote Tunnels или локально.
Этот VSIX также можно установить вручную на хост рабочей области.

При активации Router устанавливает отсутствующий плагин в каталог OpenCode,
учитывая `XDG_CONFIG_HOME`. Отличающийся существующий файл не перезаписывается.
Отключение: `opencodeNotify.autoInstallPlugin: false` в настройках хоста.

Оба VSIX доступны в [GitHub Releases](https://github.com/BuckanovNikita/opencode-notify/releases).

Команды:

- **OpenCode Notify: Install or Update OpenCode v1 Plugin** — установка комплектного плагина.
- **OpenCode Notify: Test Connection** — проверка доставки.
- **OpenCode Notify: Start OpenCode** — запуск терминала с привязкой к уведомлениям.

Откройте новый терминал после установки или перезагрузки окна.
Для собственных скриптов: `opencode-notify "Готово"`.
Соединение VS Code должно оставаться открытым. OpenCode v2 не поддерживается.

Полная [инструкция](https://github.com/BuckanovNikita/opencode-notify#readme).
