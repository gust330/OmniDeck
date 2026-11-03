import { useEffect, useState } from 'react'

import { useConnectionStore } from '@/stores/connection-store'
import { useInputStore } from '@/stores/input-store'
import type { HostConfig, SettingsTrigger, TouchCalibration } from '@/types'

const resolutions: HostConfig['resolution'][] = ['1080p', '1440p', '4K']
const codecs: { value: HostConfig['codec']; label: string }[] = [
  { value: 'h264', label: 'H264' },
  { value: 'h265', label: 'H265' },
  { value: 'av1', label: 'AV1' },
]

const settingsTriggers: { value: SettingsTrigger; label: string }[] = [
  { value: 'hud-button', label: 'HUD button' },
  { value: 'three-finger-tap', label: 'Three-finger tap' },
  { value: 'two-finger-double-tap', label: 'Two-finger double-tap' },
  { value: 'corner-swipe', label: 'Corner swipe' },
]

export default function SettingsModal() {
  const { hostConfig, setHostConfig, streamSettings, setStreamSettings, showSettings, toggleSettings } = useConnectionStore()
  const { touchCalibration, setTouchCalibration, settingsTrigger, setSettingsTrigger } = useInputStore()
  const [draft, setDraft] = useState(hostConfig)
  const [calibrationDraft, setCalibrationDraft] = useState<TouchCalibration>(touchCalibration)
  const [triggerDraft, setTriggerDraft] = useState<SettingsTrigger>(settingsTrigger)

  useEffect(() => {
    if (showSettings) {
      setDraft(hostConfig)
      setCalibrationDraft(touchCalibration)
      setTriggerDraft(settingsTrigger)
    }
  }, [hostConfig, settingsTrigger, showSettings, touchCalibration])

  if (!showSettings) return null

  const saveAndClose = () => {
    setHostConfig(draft)
    setStreamSettings({
      ...streamSettings,
      resolution: draft.resolution,
      bitrate: draft.bitrate,
      codec: draft.codec,
    })
    setTouchCalibration(calibrationDraft)
    setSettingsTrigger(triggerDraft)
    toggleSettings()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xl"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) toggleSettings()
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="ios-glass-vibrant w-full max-w-xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-[26px] p-6 text-white shadow-ios-island">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 id="settings-title" className="text-2xl font-semibold tracking-tight">Stream Settings</h1>
            <p className="mt-1 text-sm text-white/50">Connection, input calibration, and quality for your host.</p>
          </div>
          <button type="button" aria-label="Close settings" onClick={toggleSettings} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl text-white/70 hover:bg-white/15">×</button>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Host Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-apple-blue"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Host URL</span>
            <input
              type="text"
              inputMode="url"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-apple-blue"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Resolution</legend>
            <div className="grid grid-cols-3 gap-2">
              {resolutions.map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  onClick={() => setDraft({ ...draft, resolution })}
                  className={`h-10 rounded-xl text-sm font-semibold transition-colors ${draft.resolution === resolution ? 'bg-apple-blue text-white' : 'bg-white/[0.07] text-white/60 hover:text-white'}`}
                >
                  {resolution}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm font-medium">
              <span>Bitrate</span>
              <span className="tabular-nums text-apple-teal">{draft.bitrate} Mbps</span>
            </span>
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={draft.bitrate}
              onChange={(event) => setDraft({ ...draft, bitrate: Number(event.target.value) })}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-apple-blue"
            />
            <span className="mt-2 flex justify-between text-xs tabular-nums text-white/35"><span>10 Mbps</span><span>150 Mbps</span></span>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Codec</legend>
            <div className="grid grid-cols-3 gap-2">
              {codecs.map((codec) => (
                <button
                  key={codec.value}
                  type="button"
                  onClick={() => setDraft({ ...draft, codec: codec.value })}
                  className={`h-10 rounded-xl text-sm font-semibold transition-colors ${draft.codec === codec.value ? 'bg-apple-blue text-white' : 'bg-white/[0.07] text-white/60 hover:text-white'}`}
                >
                  {codec.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Settings Opening Trigger</legend>
            <div role="radiogroup" aria-label="Settings opening trigger" className="grid grid-cols-2 gap-2">
              {settingsTriggers.map((trigger) => (
                <button
                  key={trigger.value}
                  type="button"
                  role="radio"
                  aria-checked={triggerDraft === trigger.value}
                  onClick={() => setTriggerDraft(trigger.value)}
                  className={`h-10 rounded-xl px-2 text-xs font-semibold transition-colors ${
                    triggerDraft === trigger.value
                      ? 'bg-apple-blue text-white'
                      : 'bg-white/[0.07] text-white/60 hover:text-white'
                  }`}
                >
                  {trigger.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-4 rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-inset ring-white/[0.08]">
            <h2 className="text-sm font-semibold text-white/90">Touch Calibration</h2>
            <label className="block">
              <span className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>Touch Sensitivity</span>
                <span className="tabular-nums text-apple-teal">{calibrationDraft.sensitivity}%</span>
              </span>
              <input
                aria-label="Touch sensitivity"
                type="range"
                min="50"
                max="200"
                step="5"
                value={calibrationDraft.sensitivity}
                onChange={(event) =>
                  setCalibrationDraft({ ...calibrationDraft, sensitivity: Number(event.target.value) })
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-apple-blue"
              />
              <span className="mt-2 flex justify-between text-xs tabular-nums text-white/35">
                <span>50%</span>
                <span>200%</span>
              </span>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>Touch Dead Zone</span>
                <span className="tabular-nums text-apple-teal">{calibrationDraft.deadZone} px</span>
              </span>
              <input
                aria-label="Touch dead zone"
                type="range"
                min="0"
                max="20"
                step="1"
                value={calibrationDraft.deadZone}
                onChange={(event) =>
                  setCalibrationDraft({ ...calibrationDraft, deadZone: Number(event.target.value) })
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-apple-blue"
              />
              <span className="mt-2 flex justify-between text-xs tabular-nums text-white/35">
                <span>0 px</span>
                <span>20 px</span>
              </span>
            </label>
          </div>
        </div>

        <button type="button" onClick={saveAndClose} className="mt-7 h-11 w-full rounded-xl bg-apple-blue text-sm font-semibold text-white transition-transform active:scale-[0.99]">
          Save & Close
        </button>
      </section>
    </div>
  )
}
