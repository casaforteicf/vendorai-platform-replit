# App Builder Actions

A interface visual de Actions usa o mesmo modelo versionado do App Builder.

- `TemplateActionEditorDialog` grava `definition.actionUi` em uma nova Template Version draft.
- `AppActionPolicyDialog` autoriza Action keys no working draft do App Instance em `settings.runtimeAccess.actions`.
- O runtime lê somente a configuração sanitizada em `/app-runtime/apps/:appId/action-ui`.
- A execução continua em `POST /app-runtime/apps/:appId/actions/:actionKey`, protegida por snapshot publicado, App User/membership ativos, permissões atuais e executor allowlisted.

Nenhum SQL, URL, executor ou código arbitrário é configurável pelo frontend.
