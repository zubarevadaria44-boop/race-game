'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const COLORS = [
  { name: 'Red', value: 'red' },
  { name: 'Blue', value: 'blue' },
  { name: 'Green', value: 'green' },
  { name: 'Yellow', value: 'yellow' },
];

export const ARENA_ROOM = 'arena';

export default function HomePage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [color, setColor] = useState('red');
  const [collisions, setCollisions] = useState(true);

  function handlePlay() {
    if (!playerName.trim()) {
      alert('Enter your name!');
      return;
    }
    const params = new URLSearchParams({
      name: playerName,
      color,
      collisions: collisions ? '1' : '0',
    });
    router.push(`/race/${ARENA_ROOM}?${params.toString()}`);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#111',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', margin: 0 }}>🏎️ Rocket Arena</h1>
      <p style={{ margin: 0, opacity: 0.7, textAlign: 'center', maxWidth: 360 }}>
        3-minute rounds · 3 lives · grab rockets, shields &amp; spread shots
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '320px' }}>
        <label>Name</label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Your name"
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '320px' }}>
        <label>Car color</label>
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

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '320px', cursor: 'pointer' }}>
        <input type="checkbox" checked={collisions} onChange={(e) => setCollisions(e.target.checked)} />
        Car collisions
      </label>

      <button
        onClick={handlePlay}
        style={{
          padding: '0.85rem 1.5rem',
          fontSize: '1.1rem',
          width: '320px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        Play
      </button>
    </div>
  );
}
