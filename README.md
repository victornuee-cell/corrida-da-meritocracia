# Corrida da Meritocracia — Multiplayer

Jogo multiplayer de sala com código, feito com Node.js + Express + Socket.IO. A sala suporta até 120 jogadores por sala (limite configurável no servidor). Todos entram pelo navegador do celular; quem cria a sala é anfitrião e pode iniciar/resetar.

## Rodar localmente
1. Instale Node.js 18+.
2. Abra terminal nesta pasta e execute `npm install`.
3. Execute `npm start`.
4. Acesse `http://localhost:3000` no computador.
5. Para outros celulares na mesma rede Wi-Fi, use o IP local do computador, por exemplo `http://192.168.x.x:3000`.

## Publicar online (para celulares em redes diferentes)
Hospede em um serviço que suporte Node.js e WebSockets (por exemplo Render, Railway ou Fly.io). Suba este diretório como um repositório Git. O comando de inicialização é `npm start`. Não é necessário banco de dados para uma sala em memória; se o serviço reiniciar, as salas serão apagadas. Use instância persistente para WebSockets e desative escala horizontal sem sticky sessions, ou configure sticky sessions/adapter Socket.IO se múltiplas instâncias forem usadas.

## Regras
- O anfitrião inicia a sala; mínimo 2 jogadores.
- Cada jogador recebe uma condição social aleatória e uma posição inicial aleatória de 0 a 5.
- Cada rodada, todos rolam uma vez. Eventos dão bônus/penalidades de movimento conforme condição.
- Primeiro a atingir 35 vence; no fim, as condições de cada jogador são reveladas para discussão.
- Para reiniciar, anfitrião clica “Jogar novamente”.
