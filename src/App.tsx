import { useEffect } from 'react'
import { useStore } from './state/store'
import TopBar from './components/TopBar'
import ChatPanel from './components/ChatPanel'
import Viewport from './components/Viewport'
import RightPanel from './components/RightPanel'
import EnginesModal from './components/EnginesModal'
import HelpModal from './components/HelpModal'

const IDLE_TITLE = 'Vibemesh — AI parametric CAD for 3D printing'

export default function App() {
  const init = useStore((s) => s.init)
  const generating = useStore((s) => s.generating)
  const compileStatus = useStore((s) => s.compileStatus)

  useEffect(() => {
    void init()
  }, [init])

  // surface long-running work in the tab title (AI runs can take minutes)
  useEffect(() => {
    document.title = generating ? '⌛ AI drafting… · Vibemesh' : compileStatus === 'compiling' ? '⚙ Rendering… · Vibemesh' : IDLE_TITLE
  }, [generating, compileStatus])

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <ChatPanel />
        <Viewport />
        <RightPanel />
      </div>
      <EnginesModal />
      <HelpModal />
    </div>
  )
}
