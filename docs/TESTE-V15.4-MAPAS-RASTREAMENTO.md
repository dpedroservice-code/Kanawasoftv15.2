# Testes — Mapas e Rastreamento GPS v15.4

## Implementado
- Leaflet + OpenStreetMap para mapa interativo da frota.
- Nominatim para pesquisa de endereços em Angola e OSRM para cálculo de rota rodoviária, distância e duração estimada.
- Geolocalização do navegador via `watchPosition` como alternativa quando não existe a aplicação Android.
- Aplicação Android nativa de teste com serviço foreground do tipo `location`, notificação persistente e recolha GPS enquanto a aplicação é minimizada/ecrã bloqueado.
- Sessão Supabase e refresh token cifrados com Android Keystore (AES-GCM).
- Envio autenticado para o registo `gpsTracking` na tabela existente `ks_records`, sujeito a RLS e permissões do módulo `frota-gps`.
- Identificador estável por dispositivo para impedir colisões entre IDs locais de diferentes telemóveis.
- Sincronização seletiva entre dispositivos por consulta cloud a cada 15 segundos enquanto o módulo de mapa está aberto.
- Histórico limitado às últimas 100 posições por dispositivo.
- Nenhuma chave service-role, migração ou alteração de dados da empresa de produção foi introduzida.

## Limites importantes
- O GPS Android é a localização do telemóvel do motorista; não rastreia o veículo se o telemóvel não estiver com ele. Para rastrear o veículo independentemente do motorista é necessário hardware GPS/OBD 4G e integração com o fornecedor.
- O serviço Android precisa de ser iniciado com a aplicação visível, de permissão de localização precisa e de notificação. Forçar paragem, revogar permissões, desligar a localização ou restrições agressivas de bateria do fabricante podem interromper o rastreamento. Alguns equipamentos Xiaomi/MIUI/HyperOS exigem permitir início automático e bateria sem restrições.
- A versão web no Chrome não garante recolha contínua em segundo plano; usar o APK Android para o teste de ecrã bloqueado.
- A sincronização entre dispositivos é polling de 15 segundos, não Supabase Realtime. Os outros dispositivos recebem posições quando o mapa está aberto; ao abrir o mapa, carregam o estado mais recente.
- OpenStreetMap, Nominatim e OSRM são serviços comunitários sem SLA comercial. Para alto volume, configurar fornecedor contratado ou alojar serviços próprios.
- Não há integração com APIs de transportadoras nem prova de entrega nesta etapa.
- A empresa de teste no Deploy Preview deve ter nome legal ou comercial começado por `TESTE`. O preview bloqueia a empresa de produção. O Supabase é o projeto existente, com isolamento por `company_id` e RLS; não é uma instância de base de dados separada.

## Testes automatizados
Executar `npm test`. Os testes cobrem validação de coordenadas, distância geodésica, merge de posições remotas, preservação de registos offline pendentes e IDs distintos por dispositivo. O workflow Android compila o APK Debug. Estes testes não substituem teste de campo em dois telemóveis.

## Teste manual obrigatório
1. Criar uma conta de teste separada e uma empresa com nome `TESTE Kanawa GPS`; não usar a conta da empresa real no Deploy Preview.
2. Abrir o Deploy Preview e entrar na empresa de teste.
3. Instalar o artefacto `kanawa-android-debug` do workflow GitHub Actions no Android.
4. Abrir Frota → GPS, carregar em Iniciar GPS e autorizar localização precisa.
5. Confirmar a notificação persistente “Kanawa Soft · GPS da frota”.
6. Minimizar a aplicação, bloquear o ecrã e deslocar-se; confirmar novas posições no histórico/mapa.
7. Num segundo telemóvel, instalar o mesmo APK e entrar na mesma empresa de teste; confirmar que as duas posições aparecem no mapa após a sincronização.
8. Deixar o mapa aberto no segundo dispositivo e verificar a atualização periódica (até cerca de 15 segundos).
9. Parar o rastreamento e confirmar estado Parado.
10. Testar sem Internet, sessão expirada e perfil sem permissões `criar`/`editar` em Frota GPS.
11. Calcular rota entre dois endereços conhecidos de Luanda e confirmar a distância/estimativa.

## Estado
- CI JavaScript e testes unitários: executados pelo GitHub Actions.
- APK Android Debug: compilação automatizada; teste físico Android ainda necessário.
- Deploy Preview: publicado, sem integrar na produção.
- GPS físico, consumo de bateria, sessão expirada, rede intermitente e sincronização com dois telemóveis: pendentes de validação de campo.
