# Testes — Mapas e Rastreamento GPS v15.4

## Implementado nesta etapa
- Leaflet para mapa interativo e OpenStreetMap para camada cartográfica.
- Geocodificação de endereços em Angola via Nominatim, com intervalo mínimo entre as duas pesquisas da rota.
- Cálculo de rota rodoviária, distância e duração estimada via OSRM.
- Geolocalização do navegador via `watchPosition`, iniciada apenas por ação explícita do utilizador.
- Persistência do último ponto e trilho limitado às últimas 100 posições no registo `gpsTracking`, usando o armazenamento local e o mecanismo cloud existente.
- Identificador estável por dispositivo (`trackingKey`) usado como chave do registo GPS na nuvem, evitando colisões de IDs auto-incrementais entre telemóveis.
- Mapa da frota com marcadores e planeador de rota.
- Validação de coordenadas e cálculo de distância Haversine.

## Limites importantes
- OpenStreetMap, Nominatim e o servidor público OSRM são serviços comunitários. Não oferecem SLA, limites de produção garantidos nem contrato de disponibilidade.
- Para uso comercial de grande volume, deve ser contratado/configurado um fornecedor de mapas/rotas ou alojar serviços próprios. Não foi criada nem inventada qualquer chave API.
- Geolocalização do navegador não é telemetria de veículo: depende de permissão, HTTPS, energia, rede e a aplicação permanecer ativa. Android pode suspender o rastreamento quando o ecrã/app fica em segundo plano.
- Rastreamento contínuo de veículos requer hardware GPS/OBD/4G ou aplicação móvel dedicada com serviço de localização em segundo plano.
- Não há integração com API de transportadoras nem prova de entrega nesta etapa.
- A trilha guarda no máximo 100 pontos por dispositivo para limitar volume de dados.
- O código usa o store genérico `gpsTracking` existente; nenhuma migração nem alteração de dados de produção foi executada.

## Testes automatizados
Executar `npm test`. Os testes desta etapa cobrem validação de coordenadas e cálculo geodésico. Não simulam permissões GPS, chamadas externas, mapas no browser ou sincronização real com Supabase.

## Teste manual obrigatório em HTTPS
1. Abrir Frota → GPS num telemóvel Android com localização ligada.
2. Confirmar que o mapa OpenStreetMap aparece e atribui os créditos.
3. Clicar em Iniciar GPS e autorizar a localização.
4. Confirmar a posição e precisão aproximada no mapa.
5. Aguardar pelo menos 30 segundos e confirmar que a posição foi persistida.
6. Parar o GPS e confirmar estado Parado.
7. Abrir noutro dispositivo da mesma empresa e confirmar que a última posição sincronizada aparece.
8. Calcular rota entre dois endereços conhecidos de Luanda; confirmar distância, duração estimada e linha no mapa.
9. Repetir sem Internet: o mapa/rotas externos devem indicar indisponibilidade sem afirmar sucesso.
10. Testar permissões com utilizador sem acesso a edição de frota.

## Estado
- Motor e validações unitárias: cobertos por testes automatizados.
- Serviços externos e mapa no browser: pendentes de teste de integração.
- GPS real em Android e sincronização multi-dispositivo: pendentes de teste de campo.
- Produção: não publicado nem ativado por esta alteração.
