'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const COLORS = [
  { name: 'Красный', value: 'red' },
  { name: 'Синий', value: 'blue' },
  { name: 'Зелёный', value: 'green' },
  { name: 'Жёлтый', value: 'yellow' },
];

function generateRoomCode() {
  const code = Math.floor(1000 + Math.random() * 9000);
  return code.toString();
}

export default function HomePage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [color, setColor] = useState('red');
  const [joinCode, setJoinCode] = useState('');

  function goToRoom(roomId) {
    if (!playerName.trim()) {
      alert('Введи имя!');
      return;
    }
    const params = new URLSearchParams({ name: playerName, color });
    router.push(`/race/${roomId}?${params.toString()}`);
  }

  function handleCreate() {
    const newCode = generateRoomCode();
    goToRoom(newCode);
  }

  function handleJoin() {
    if (!joinCode.trim()) {
      alert('Введи код комнаты!');
      return;
    }
    goToRoom(joinCode.trim());
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#111',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5rem',
      padding: '2rem',
    }}>
      <h1 style={{ fontSize: '2rem' }}>🏎️ Гонки</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '280px' }}>
        <label>Имя</label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Твоё имя"
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '280px' }}>
        <label>Цвет машины</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: c.value,
                border: color === c.value ? '3px solid white' : '3px solid transparent',
                borderRadius: '50%',
                cursor: 'pointer',
              }}
              title={c.name}
            />
          ))}
        </div>
      </div>

      <button
        onClick={handleCreate}
        style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', width: '280px', cursor: 'pointer' }}
      >
        Создать комнату
      </button>

      <div style={{ display: 'flex', gap: '0.5rem', width: '280px' }}>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Код комнаты"
          style={{ padding: '0.5rem', fontSize: '1rem', flex: 1 }}
        />
        <button onClick={handleJoin} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Войти
        </button>
      </div>
    </div>
  );
}