import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BUS_NAME = 'io.github.omnideck.ShellBridge';
const OBJECT_PATH = '/io/github/omnideck/ShellBridge';
const IFACE_XML = `
<node>
  <interface name="io.github.omnideck.ShellBridge">
    <method name="ListWindows"><arg type="s" direction="out" name="json"/></method>
    <method name="Activate">
      <arg type="s" direction="in" name="desktopId"/>
      <arg type="s" direction="out" name="json"/>
    </method>
  </interface>
</node>`;

class Bridge {
    _windowInfo(actor) {
        const window = actor.meta_window;
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const rect = window.get_frame_rect();
        return {
            appId: app?.get_id() ?? null,
            title: window.get_title() ?? '',
            focused: window.has_focus(),
            bbox: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
        };
    }

    _windows() {
        return global.get_window_actors()
            .filter(actor => !actor.meta_window.skip_taskbar)
            .map(actor => this._windowInfo(actor));
    }

    ListWindows() {
        return JSON.stringify(this._windows());
    }

    Activate(desktopId) {
        const actor = global.get_window_actors().find(candidate => {
            const app = Shell.WindowTracker.get_default().get_window_app(candidate.meta_window);
            return app?.get_id() === desktopId;
        });
        if (!actor)
            throw new Error(`No window for ${desktopId}`);
        actor.meta_window.activate(global.get_current_time());
        return JSON.stringify(this._windowInfo(actor));
    }
}

export default class OmniDeckShellBridge extends Extension {
    enable() {
        this._bridge = new Bridge();
        this._exported = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, this._bridge);
        this._exported.export(Gio.DBus.session, OBJECT_PATH);
        this._nameId = Gio.bus_own_name_on_connection(
            Gio.DBus.session, BUS_NAME, Gio.BusNameOwnerFlags.NONE, null, null);
    }

    disable() {
        if (this._nameId)
            Gio.bus_unown_name(this._nameId);
        this._exported?.unexport();
        this._nameId = null;
        this._exported = null;
        this._bridge = null;
    }
}
