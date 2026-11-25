const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const FINISH = 35;
const profiles = [
  { name: 'Rede de apoio', description: 'Conta com apoio em casa, acesso a recursos e mais tempo para estudar.', tag: 'APOIO' },
  { name: 'Trajetória equilibrada', description: 'Tem alguns recursos, mas também enfrenta dificuldades e imprevistos.', tag: 'MISTO' },
  { name: 'Obstáculos acumulados', description: 'Precisa conciliar estudo com trabalho, deslocamento ou responsabilidades.', tag: 'BARREIRAS' }
];
const events = [
  { title: 'Internet e equipamento disponíveis', detail: 'Você tem internet estável e um computador para estudar.', move: 2, kind: 'positive', types: ['Rede de apoio'] },
  { title: 'Transporte atrasou', detail: 'O deslocamento tomou parte do seu tempo e você perdeu uma atividade.', move: -1, kind: 'negative', types: ['Obstáculos acumulados'] },
  { title: 'Material de estudo', detail: 'Você conseguiu os materiais necessários para se preparar.', move: 2, kind: 'positive', types: ['Rede de apoio'] },
  { title: 'Turno extra de trabalho', detail: 'Você precisou trabalhar e teve menos tempo para estudar.', move: -2, kind: 'negative', types: ['Obstáculos acumulados'] },
  { title: 'Apoio para se organizar', detail: 'Uma pessoa ou serviço ajudou a organizar sua rotina.', move: 1, kind: 'positive', types: ['Trajetória equilibrada', 'Obstáculos acumulados'] },
  { title: 'Escola sem estrutura adequada', detail: 'A falta de recursos da escola dificultou a atividade de hoje.', move: -1, kind: 'negative', types: ['Trajetória equilibrada', 'Obstáculos acumulados'] },
  { title: 'Oportunidade de preparação', detail: 'Você teve acesso a uma atividade preparatória ou orientação.', move: 2, kind: 'positive', types: ['Rede de apoio', 'Trajetória equilibrada'] },
  { title: 'Responsabilidades em casa', detail: 'As tarefas e responsabilidades familiares reduziram seu tempo livre.', move: -1, kind: 'negative', types: ['Trajetória equilibrada', 'Obstáculos acumulados'] },
  { title: 'Aula e aprendizado', detail: 'Uma aula fez sentido e ajudou você a avançar.', move: 1, kind: 'neutral', types: [] },
  { title: 'Dia sem imprevistos', detail: 'Hoje, nada atrapalhou sua rotina.', move: 0, kind: 'neutral', types: [] }
];
function code() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function cleanName(n) { return String(n || '').trim().replace(/[<>]/g, '').slice(0, 18) || 'Jogador'; }
function publicState(room) {
  return {
    code: room.code, hostId: room.hostId, status: room.status, round: room.round, finish: FINISH,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, position:p.position, start:p.start, rolled:p.rolled, finished:p.finished, profile: room.status === 'finished' ? p.profile : null })),
    log: room.log.slice(-15),
    winner: room.winner || null
  };
}
function broadcast(room) { io.to(room.code).emit('state', publicState(room)); }
function roomBySocket(socket) { return rooms.get(socket.data.room); }
function emitError(socket, message) { socket.emit('notice', message); }
function finishIfNeeded(room) {
  const winners = [...room.players.values()].filter(p => p.position >= FINISH);
  if (winners.length) {
    room.status = 'finished';
    winners.sort((a,b) => b.position-a.position);
    room.winner = winners[0].name;
    room.log.unshift({ round: room.round, text: `🏁 ${room.winner} chegou primeiro!` });
  }
}
io.on('connection', socket => {
  socket.on('createRoom', ({name}={}) => {
    let roomCode; do { roomCode = code(); } while (rooms.has(roomCode));
    const player = { id:socket.id, name:cleanName(name), position:0, start:0, rolled:false, finished:false, profile:null };
    const room = { code:roomCode, hostId:socket.id, status:'lobby', round:0, players:new Map([[socket.id,player]]), log:[], winner:null };
    rooms.set(roomCode,room); socket.join(roomCode); socket.data.room=roomCode;
    socket.emit('joined', {code:roomCode, playerId:socket.id, isHost:true}); broadcast(room);
  });
  socket.on('joinRoom', ({code:rawCode,name}={}) => {
    const roomCode = String(rawCode || '').toUpperCase().trim(); const room=rooms.get(roomCode);
    if(!room) return emitError(socket,'Sala não encontrada. Confira o código.');
    if(room.status !== 'lobby') return emitError(socket,'Essa corrida já começou. Crie outra sala ou aguarde a próxima.');
    if(room.players.size >= 120) return emitError(socket,'A sala atingiu a capacidade de 120 participantes.');
    const player={id:socket.id,name:cleanName(name),position:0,start:0,rolled:false,finished:false,profile:null};
    room.players.set(socket.id,player); socket.join(roomCode); socket.data.room=roomCode;
    socket.emit('joined',{code:roomCode,playerId:socket.id,isHost:false}); broadcast(room);
  });
  socket.on('startGame', () => {
    const room=roomBySocket(socket); if(!room) return;
    if(socket.id !== room.hostId) return emitError(socket,'Somente quem criou a sala pode iniciar.');
    if(room.players.size < 2) return emitError(socket,'Esperem pelo menos mais uma pessoa entrar para iniciar.');
    room.status='playing'; room.round=1;
    const profileBag = [...profiles, ...profiles, ...profiles, ...profiles];
    for(const p of room.players.values()) {
      const prof=profileBag.splice(Math.floor(Math.random()*profileBag.length),1)[0] || profiles[Math.floor(Math.random()*profiles.length)];
      p.profile=prof; p.start=Math.floor(Math.random()*6); p.position=p.start; p.rolled=false;
    }
    room.log.unshift({round:1,text:'🚦 A corrida começou! Cada pessoa larga de uma posição diferente.'}); broadcast(room);
  });
  socket.on('roll', () => {
    const room=roomBySocket(socket); if(!room || room.status!=='playing') return;
    const p=room.players.get(socket.id); if(!p || p.rolled || p.finished) return;
    const die=1+Math.floor(Math.random()*6);
    let pool=events.filter(e => e.types.includes(p.profile.name));
    if(Math.random()<0.52 || pool.length===0) pool=events.filter(e=>e.types.length===0);
    if(pool.length===0) pool=events;
    const ev=pool[Math.floor(Math.random()*pool.length)];
    const mod=ev.types.includes(p.profile.name) ? ev.move : 0;
    const movement=Math.max(0,die+mod);
    p.position=Math.min(FINISH, p.position+movement);
    p.rolled=true; p.finished=p.position>=FINISH;
    const text=`${p.name}: dado ${die} · ${ev.title} (${mod>0?'+':''}${mod}) · avançou ${movement} casas.`;
    room.log.unshift({round:room.round,text});
    finishIfNeeded(room);
    if(room.status==='playing' && [...room.players.values()].every(x=>x.rolled || x.finished)) {
      room.round++; for(const x of room.players.values()) if(!x.finished) x.rolled=false;
      room.log.unshift({round:room.round,text:`🔄 Rodada ${room.round} começou. Todo mundo que ainda está na corrida pode jogar.`});
    }
    broadcast(room);
  });
  socket.on('resetGame', () => {
    const room=roomBySocket(socket); if(!room || socket.id!==room.hostId) return;
    room.status='lobby'; room.round=0; room.log=[]; room.winner=null;
    for(const p of room.players.values()){p.position=0;p.start=0;p.rolled=false;p.finished=false;p.profile=null;}
    broadcast(room);
  });
  socket.on('disconnect', () => {
    const room=roomBySocket(socket); if(!room) return;
    room.players.delete(socket.id);
    if(room.players.size===0){rooms.delete(room.code);return;}
    if(room.hostId===socket.id){room.hostId=[...room.players.keys()][0];}
    broadcast(room);
  });
});
const port=process.env.PORT || 3000;
server.listen(port,()=>console.log(`Corrida da Meritocracia rodando na porta ${port}`));
