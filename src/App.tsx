import { useState, useEffect } from 'react';
import { FabricOverlay } from './overlay/FabricOverlay.tsx';
import { StreamerDashboard } from './components/StreamerDashboard.tsx';
import { AspectRatio } from '../backend/types.ts';

export default function App() {
  const [isOverlayRoute, setIsOverlayRoute] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>('9:16');

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    const isOverlay = path.includes('/overlay') || params.get('view') === 'overlay' || params.has('aspect');
    setIsOverlayRoute(isOverlay);

    const aspectParam = params.get('aspect');
    if (aspectParam === '16x9' || aspectParam === '16:9') {
      setAspect('16:9');
    } else {
      setAspect('9:16');
    }
  }, []);

  if (isOverlayRoute) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-transparent m-0 p-0 flex items-center justify-center">
        <FabricOverlay aspectRatio={aspect} isObsSource={true} />
      </div>
    );
  }

  return <StreamerDashboard />;
}
