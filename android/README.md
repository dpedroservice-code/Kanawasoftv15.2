# Kanawa Soft Android — GPS de frota (teste)

Este projeto é uma aplicação Android nativa que abre a interface web do KanawaSoft e disponibiliza um serviço de localização em primeiro plano.

## Funcionalidades
- Serviço Android do tipo `location`, com notificação persistente.
- Recolha GPS mesmo quando o utilizador minimiza a aplicação ou desliga o ecrã, enquanto o serviço permanecer ativo e o Android permitir execução.
- Sessão Supabase e refresh token guardados cifrados com Android Keystore (AES-GCM).
- Envio autenticado para `ks_records`, loja `gpsTracking`, com as permissões RLS da empresa e módulo de frota.
- Trilho limitado a 100 posições por dispositivo.
- A aplicação web sincroniza posições de outros dispositivos a cada 15 segundos enquanto o ecrã de mapa está aberto.

## Compilar APK de teste
O workflow GitHub Actions compila um APK Debug e publica-o como artefacto `kanawa-android-debug`.
O URL web é definido com `KANAWA_WEB_URL`; por omissão aponta para o Deploy Preview do PR #13.

Compilação local:
```bash
gradle -p android :app:assembleDebug -PKANAWA_WEB_URL=https://deploy-preview-13--kanawa-soft.netlify.app
```

APK gerado em `android/app/build/outputs/apk/debug/app-debug.apk`.

## Instalação e permissões
1. Instalar o APK Debug num Android 8.0 ou superior.
2. Entrar na conta KanawaSoft e abrir Frota → GPS.
3. Carregar em **Iniciar GPS** e permitir localização precisa.
4. Confirmar a notificação persistente “Kanawa Soft · GPS da frota”.
5. Minimizar a aplicação e testar deslocação real; confirmar que o mapa noutro dispositivo recebe a posição.
6. Para parar, voltar à aplicação e carregar em **Parar**.

O serviço é iniciado enquanto a Activity está visível, conforme as restrições de Android 12+ e Android 14+. O utilizador pode parar o serviço pela interface ou pelas definições do Android. Forçar paragem da aplicação, revogar permissões, desligar localização ou restrições agressivas de bateria do fabricante podem interromper o rastreamento. Em alguns Xiaomi/MIUI/HyperOS será necessário permitir início automático e bateria sem restrições.

## Segurança e limites
- Não existe chave service-role no APK; só a chave publicável e a sessão do utilizador autenticado.
- Os tokens são cifrados localmente pelo Android Keystore.
- A API REST continua protegida pelas políticas RLS de `ks_records` e pelas permissões `frota-gps`.
- A versão Android de teste usa o domínio Deploy Preview; não é uma versão Play Store assinada.
- Testes de GPS físico, consumo de bateria, Xiaomi/MIUI, sessão expirada, ausência de rede e sincronização entre duas contas/dispositivos continuam a exigir validação de campo.


## Ambiente de teste isolado
O Deploy Preview Netlify exige que a empresa autenticada tenha nome legal/comercial iniciado por `TESTE`. Esta verificação impede a utilização acidental da empresa de produção no ambiente de pré-visualização. Crie uma conta/empresa de teste com um endereço de email diferente e nome, por exemplo, `TESTE Kanawa GPS`. O projeto Supabase continua a ser o mesmo projeto central, mas os dados ficam separados pelo `company_id` e protegidos pelas políticas RLS existentes. Não execute testes com a empresa real.
