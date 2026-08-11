'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TRACK_LIST } from '@/lib/track';

const COLORS = [
  { name: 'Red', value: 'red' },
  { name: 'Blue', value: 'blue' },
  { name: 'Green', value: 'green' },
  { name: 'Yellow', value: 'yellow' },
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
  const [trackId, setTrackId] = useState(TRACK_LIST[0].id);
  const [collisions, setCollisions] = useState(true);

  function goToRoom(roomId) {
    if (!playerName.trim()) {
      alert('Enter your name!');
      return;
    }
    const params = new URLSearchParams({
      name: playerName,
      color,
      track: trackId,
      collisions: collisions ? '1' : '0',
    });
    router.push(`/race/${roomId}?${params.toString()}`);
  }

  function handleCreate() {
    goToRoom(generateRoomCode());
  }

  function handleJoin() {
    if (!joinCode.trim()) {
      alert('Enter a room code!');
      return;
    }
    goToRoom(joinCode.trim());
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
      <h1 style={{ fontSize: '2rem' }}>🏎️ Race Game</h1>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '320px' }}>
        <label>Select track</label>
        <select
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        >
          {TRACK_LIST.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
        </select>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '320px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={collisions}
          onChange={(e) => setCollisions(e.target.checked)}
        />
        Car collisions (block opponents)
      </label>

      <button
        onClick={handleCreate}
        style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', width: '320px', cursor: 'pointer' }}
      >
        Create room
      </button>

      <div style={{ display: 'flex', gap: '0.5rem', width: '320px' }}>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Room code"
          style={{ padding: '0.5rem', fontSize: '1rem', flex: 1 }}
        />
        <button onClick={handleJoin} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Join
        </button>
      </div>
    </div>
  );
}
