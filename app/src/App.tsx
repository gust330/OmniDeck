import React from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { StreamWorkspace } from '@/components/stream/StreamWorkspace';
import ControlCenter from '@/components/control-center/ControlCenter';
import AppLibrary from '@/components/app-library/AppLibrary';
import DockManager from '@/components/dock/DockManager';
import SettingsModal from '@/components/settings/SettingsModal';
import { useCapacitorInit } from '@/hooks/useCapacitorInit';
import './index.css';

export const App: React.FC = () => {
  useCapacitorInit();
  const { activeView } = useConnectionStore();

  return (
    <div className="relative w-screen h-screen bg-canvas overflow-hidden select-none">
      {/* Active Screen View */}
      {activeView === 'stream' && <StreamWorkspace />}
      {activeView === 'control-center' && <ControlCenter />}
      {activeView === 'app-library' && <AppLibrary />}
      {activeView === 'dock-manager' && <DockManager />}

      {/* Global Settings Modal Overlay */}
      <SettingsModal />
    </div>
  );
};

export default App;
