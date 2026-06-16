import { useEffect, useState } from 'react'
import { useStore } from './state/store'
import { useUi } from './state/ui'
import TopBar from './components/TopBar'
import ChatPanel from './components/ChatPanel'
import Viewport from './components/Viewport'
import RightPanel from './components/RightPanel'
import EnginesModal from './components/EnginesModal'
import HelpModal from './components/HelpModal'
import ErrorBoundary from './components/ErrorBoundary'
import { DCube, DSliders, DSparkFill } from './components/icons'

const IDLE_TITLE = 'Vibemesh-AI — parametric CAD for 3D printing'

/** At/below 860px the design collapses to a viewport-first layout with a bottom
 *  tab bar (sheets for chat/params). The threshold MUST match the `860px` CSS
 *  breakpoint in styles.css — otherwise 721–860px is a dead-zone: a desktop grid
 *  whose params/code column is hidden with no tab bar to reach it. */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 860)
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= 860)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return mobile
}

export default function App() {
  const init = useStore((s) => s.init)
  const generating = useStore((s) => s.generating)
  const compileStatus = useStore((s) => s.compileStatus)
  const isMobile = useIsMobile()
  const mobileTab = useUi((s) => s.mobileTab)
  const setMobileTab = useUi((s) => s.setMobileTab)

  useEffect(() => {
    void init()
  }, [init])

  // surface long-running work in the tab title (AI runs can take minutes)
  useEffect(() => {
    document.title = generating ? '⌛ AI drafting… · Vibemesh-AI' : compileStatus === 'compiling' ? '⚙ Rendering… · Vibemesh-AI' : IDLE_TITLE
  }, [generating, compileStatus])

  return (
    <div className={`app${isMobile ? ' is-mobile' : ''}`} data-accent="cobalt" data-material="workshop" data-hud="bar" data-empty="full">
      <TopBar />
      <ErrorBoundary>
        <div className="app-body">
          <ChatPanel mobileShow={isMobile && mobileTab === 'chat'} />
          <Viewport />
          <RightPanel mobileShow={isMobile && mobileTab === 'params'} />
        </div>
      </ErrorBoundary>

      {isMobile && (
        <nav className="mobile-tabbar">
          <button className={`mtab${mobileTab === 'model' ? ' active' : ''}`} onClick={() => setMobileTab('model')}>
            <DCube /> Model
          </button>
          <button className={`mtab${mobileTab === 'params' ? ' active' : ''}`} onClick={() => setMobileTab(mobileTab === 'params' ? 'model' : 'params')}>
            <DSliders /> Tweak
          </button>
          <button className={`mtab${mobileTab === 'chat' ? ' active' : ''}`} onClick={() => setMobileTab(mobileTab === 'chat' ? 'model' : 'chat')}>
            <DSparkFill /> Chat
          </button>
        </nav>
      )}

      <EnginesModal />
      <HelpModal />
    </div>
  )
}
