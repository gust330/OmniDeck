import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppLibrary from '@/components/app-library/AppLibrary'
import ControlCenter from '@/components/control-center/ControlCenter'
import { FloatingDock } from '@/components/stream/FloatingDock'
import { StreamEngine } from '@/engines/stream-engine'
import { useConnectionStore } from '@/stores/connection-store'

const remoteApp = { id: 'org.custom.CAD.desktop', name: 'Custom CAD', running: false }

describe('reliable app opening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useConnectionStore.setState({
      activeView: 'app-library',
      hostConfig: {
        ...useConnectionStore.getState().hostConfig,
        url: 'http://rig-one:8080',
      },
    })
  })

  it('AppLibrary renders only server apps and switches view only after atomic open succeeds', async () => {
    vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue([remoteApp])
    let resolveOpen!: (value: unknown) => void
    const openApp = vi.spyOn(StreamEngine.prototype, 'openApp').mockImplementation(
      () => new Promise((resolve) => { resolveOpen = resolve }),
    )

    render(<AppLibrary />)

    expect(screen.queryByText('VS Code')).not.toBeInTheDocument()
    const button = await screen.findByRole('button', { name: 'Open Custom CAD on Phone' })
    fireEvent.click(button)
    expect(openApp).toHaveBeenCalledWith('org.custom.CAD.desktop')
    expect(useConnectionStore.getState().activeView).toBe('app-library')
    expect(button).toBeDisabled()

    await act(async () => resolveOpen({ running: true, focused: true }))
    expect(useConnectionStore.getState().activeView).toBe('stream')
  })

  it('FloatingDock loads real apps and atomically opens the exact selected desktop ID', async () => {
    vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue([remoteApp])
    const openApp = vi.spyOn(StreamEngine.prototype, 'openApp').mockResolvedValue({ running: true })

    render(<FloatingDock />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open Custom CAD' }))
    expect(openApp).toHaveBeenCalledWith('org.custom.CAD.desktop')
    expect(screen.queryByRole('button', { name: 'VS Code' })).not.toBeInTheDocument()
  })

  it('FloatingDock shows an open failure instead of swallowing it', async () => {
    vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue([remoteApp])
    vi.spyOn(StreamEngine.prototype, 'openApp').mockRejectedValue(new Error('Desktop entry failed'))

    render(<FloatingDock />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open Custom CAD' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Desktop entry failed')
  })

  it('ControlCenter is a generic chooser rather than a hardcoded fake app list', () => {
    render(<ControlCenter />)

    expect(screen.queryByText('VS Code')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose application' }))
    expect(useConnectionStore.getState().activeView).toBe('app-library')
  })

  it('AppLibrary displays errors visibly when opening an app fails and avoids stale status view transitions', async () => {
    vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue([remoteApp])
    vi.spyOn(StreamEngine.prototype, 'openApp').mockRejectedValue(new Error('Process exited with code 1'))

    render(<AppLibrary />)

    const button = await screen.findByRole('button', { name: 'Open Custom CAD on Phone' })
    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('Process exited with code 1')
    expect(useConnectionStore.getState().activeView).toBe('app-library')
  })
})
