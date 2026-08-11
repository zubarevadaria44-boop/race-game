import RaceRoom from './RaceRoom';

export default async function RacePage({ params }) {
    const { roomId } = await params;
    
    return <RaceRoom roomId={roomId} />;
}