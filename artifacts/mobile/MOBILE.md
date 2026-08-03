# Vendor.ai Mobile

O aplicativo Vendor.ai usa Expo e React Native. Ele possui telas nativas para login, indicadores, leads, conversas, agenda e perfil, compartilhando a API e as regras de autorização com a plataforma web.

## Configuração

Defina a API por meio de `EXPO_PUBLIC_API_URL`. Quando a variável não estiver presente, o aplicativo usa `https://appvendorai.com`.

```powershell
$env:EXPO_PUBLIC_API_URL = "https://appvendorai.com"
pnpm --dir artifacts/mobile exec expo start
```

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
