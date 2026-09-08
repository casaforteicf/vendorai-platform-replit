# Vendor.ai Mobile

O aplicativo Vendor.ai usa Expo e React Native. Ele possui telas nativas para login, indicadores, leads, conversas, agenda e perfil, compartilhando a API e as regras de autorização com a plataforma web.

## Configuração

Defina a API por meio de `EXPO_PUBLIC_API_URL`. Quando a variável não estiver presente, o aplicativo usa `https://appvendorai.com`.

```powershell
$env:EXPO_PUBLIC_API_URL = "https://appvendorai.com"
pnpm --dir artifacts/mobile exec expo start
```

## JARVIS — ativação por voz no Android

O app possui uma camada nativa de wake word para abrir o JARVIS ao detectar a palavra `Jarvis` enquanto o serviço foreground estiver ativo.

Fluxo:

1. Abra **Perfil → Jarvis — ativação por voz**.
2. Toque em **Ativar “Jarvis” em segundo plano** e conceda acesso ao microfone.
3. O Android mantém um serviço foreground com notificação permanente `Jarvis ativo`.
4. Com a interface fechada/em segundo plano, diga `Jarvis`.
5. O app abre em `vendorai://jarvis?wake=1`, responde por voz e inicia o reconhecimento do próximo comando em `pt-BR`.
6. O comando é enviado autenticado a `/api/support/chat`; a resposta do JARVIS é exibida e falada, mantendo a sessão de voz.

A detecção da palavra de ativação é on-device por Porcupine. Configure a chave da Picovoice como secret de build:

```bash
PICOVOICE_ACCESS_KEY=<secret>
```

A chave é lida somente durante o prebuild e não deve ser versionada. O plugin `plugins/with-jarvis-wake-word.js` injeta o serviço Android, permissões e metadados necessários.

### Limitações do Android

- O usuário precisa conceder microfone e iniciar o serviço ao menos uma vez com o app em primeiro plano.
- Fechar a interface ou removê-la de Recentes não encerra o serviço (`stopWithTask=false`).
- **Force stop**, reinicialização do aparelho, revogação de microfone ou encerramento agressivo pelo fabricante podem interromper a escuta. Android 14+ restringe iniciar do zero um foreground service de microfone a partir do background; por isso o serviço é iniciado conscientemente enquanto o app está visível.
- A notificação persistente é intencional e necessária para transparência e para o foreground service de microfone.

## Builds de loja

Os identificadores definidos são:

- Android: `com.appvendorai.vendorai`
- iOS: `com.appvendorai.vendorai`
- Deep link: `vendorai://`

O token de autenticação é armazenado no SecureStore do sistema. Dados não sensíveis do perfil continuam em AsyncStorage.

Com uma conta Expo/EAS configurada, os perfis de homologação e produção estão em `eas.json`.

```powershell
pnpm --dir artifacts/mobile exec eas build --platform android --profile preview
pnpm --dir artifacts/mobile exec eas build --platform all --profile production
```

As chaves de assinatura, credenciais das lojas e variáveis secretas devem permanecer fora do repositório.
