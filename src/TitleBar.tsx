import { useState, useEffect } from 'react';
import './TitleBar.css';
import { Maximize2, Minimize, Minimize2, X } from 'lucide-react';


function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const onWindowStateChange = (maximized: any) => {
      setIsMaximized(maximized);
    };
    
    // 1. Call the function from your preload script.
    //    It now returns a cleanup function.
    const cleanup = window.electron.onWindowStateChange(onWindowStateChange);

    // 2. The useEffect hook's return statement is the cleanup phase.
    //    Simply return the cleanup function you received.
    return cleanup;
  }, []); // The empty dependency array ensures this runs only once on mount/unmount

  const handleMinimize = () => {
    window.electron.minimize();
  };

  const handleMaximize = () => {
    window.electron.maximize();
  };

  const handleClose = () => {
    window.electron.close();
  };

  return (
    <div className="title-bar">
      <div className="title-bar-text">MindSage</div>
      <div className="title-bar-controls">
        <button className="title-bar-button" onClick={handleMinimize}>
          <Minimize2 />
        </button>
        <button className="title-bar-button" onClick={handleMaximize}>
          {isMaximized ? <Minimize /> : <Maximize2 />}
        </button>
        <button className="title-bar-button close-button" onClick={handleClose}>
          <X />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;