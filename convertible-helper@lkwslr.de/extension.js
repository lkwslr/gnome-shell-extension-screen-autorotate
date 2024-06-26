/* extension.js
* Copyright (C) 2024  kosmospredanie, shyzus, Shinigaminai, lkwslr
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickMenuToggle, QuickSettingsMenu, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Rotator from './rotator.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as KeyboardUI from 'resource:///org/gnome/shell/ui/keyboard.js';

const ORIENTATION_LOCK_SCHEMA = 'org.gnome.settings-daemon.peripherals.touchscreen';
const ORIENTATION_LOCK_KEY = 'orientation-lock';
const A11Y_APPLICATIONS_SCHEMA = 'org.gnome.desktop.a11y.applications';
const SHOW_KEYBOARD = 'screen-keyboard-enabled';

const laptop_mode = `
sudo killall evtest
sudo evemu-event /dev/input/by-path/platform-thinkpad_acpi-event --type 5 --code 1 --value 0 --sync
`;

const tablet_mode = `
sudo evemu-event /dev/input/by-path/platform-thinkpad_acpi-event --type 5 --code 1 --value 1 --sync
sudo evtest --grab /dev/input/by-path/platform-i8042-serio-0-event-kbd
`;


// Orientation names must match those provided by net.hadess.SensorProxy
const Orientation = Object.freeze({
  'normal': 0,
  'left-up': 1,
  'bottom-up': 2,
  'right-up': 3
});

const ManualOrientationIndicator = GObject.registerClass(
class ManualOrientationIndicator extends SystemIndicator {
    _init(ext_ref) {
        super._init();
        this.toggle = new ManualOrientationMenuToggle(ext_ref);
        this.quickSettingsItems.push(this.toggle);
    }

    destroy() {
      this.quickSettingsItems.pop(this.toggle);
      this.toggle.destroy();
    }
});

const ManualOrientationMenuToggle = GObject.registerClass(
class ManualOrientationMenuToggle extends QuickMenuToggle {
    _init(ext) {
      super._init({
        title: _('Rotate'),
        iconName: 'object-rotate-left-symbolic',
        menuEnabled: true,
        toggleMode: true,
      });

      this.menu.setHeader('object-rotate-left-symbolic', _('Screen Rotate'));

      this._section = new PopupMenu.PopupMenuSection();
      this.menu.addMenuItem(this._section);

      this.landscapeItem = new PopupMenu.PopupMenuItem('Landscape', {
        reactive: true,
        can_focus: true,
      });

      this.portraitLeftItem = new PopupMenu.PopupMenuItem('Portrait Left', {
        reactive: true,
        can_focus: true,
      });

      this.landscapeFlipItem = new PopupMenu.PopupMenuItem('Landscape Flipped', {
        reactive: true,
        can_focus: true,
      });

      this.portraitRightItem = new PopupMenu.PopupMenuItem('Portrait Right', {
        reactive: true,
        can_focus: true,
      });

      this.landscapeItem.connect('activate', () => {
        this._onItemActivate(this.landscapeItem);
        ext.rotate_to('normal');
      });
      this.portraitLeftItem.connect('activate', () => {
        this._onItemActivate(this.portraitLeftItem);
        ext.rotate_to('left-up');
      });
      this.landscapeFlipItem.connect('activate', () => {
        this._onItemActivate(this.landscapeFlipItem);
        ext.rotate_to('bottom-up');
      });
      this.portraitRightItem.connect('activate', () => {
        this._onItemActivate(this.portraitRightItem);
        ext.rotate_to('right-up');
      });

      this._section.addMenuItem(this.landscapeItem);
      this._section.addMenuItem(this.portraitLeftItem);
      this._section.addMenuItem(this.landscapeFlipItem);
      this._section.addMenuItem(this.portraitRightItem);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addSettingsAction(_('Extension Settings'),
            'com.mattjakeman.ExtensionManager.desktop');

      this.connect('clicked', () => {
        if (this.checked == true) {
            ext.rotate_to('right-up');
        } else {
            ext.rotate_to('normal');
        }
      });
    }

    _onItemActivate(item) {
      this.landscapeItem.setOrnament(PopupMenu.Ornament.HIDDEN);
      this.portraitLeftItem.setOrnament(PopupMenu.Ornament.HIDDEN);
      this.landscapeFlipItem.setOrnament(PopupMenu.Ornament.HIDDEN);
      this.portraitRightItem.setOrnament(PopupMenu.Ornament.HIDDEN);

      item.setOrnament(PopupMenu.Ornament.CHECK);
    }
});


const ManualTabletModeIndicator = GObject.registerClass(
    class ManualTabletModeIndicator extends SystemIndicator {
      _init(ext_ref, settings) {
        super._init();
        this.toggle = new ManualTabletMenuToggle(ext_ref, settings);
        this.quickSettingsItems.push(this.toggle);
      }

      destroy() {
        this.quickSettingsItems.pop(this.toggle);
        this.toggle.destroy();
      }
    });

const ManualTabletMenuToggle = GObject.registerClass(
    class ManualTabletMenuToggle extends QuickMenuToggle {
      _init(ext, settings) {
        super._init({
          title: _('Tablet Mode'),
          iconName: 'input-tablet-symbolic',
          menuEnabled: false,
          toggleMode: true,
        });

        this.connect('clicked', () => {
          if (this.checked === true) {
            settings.set_boolean('tablet-mode', true)
          } else {
            settings.set_boolean('tablet-mode', false)
          }
        });

        settings.connect('changed::tablet-mode', (settings, key) => {
          if (settings.get_boolean('sw-tablet-mode')) {
            if (settings.get_boolean('debug-logging')) {
              console.log(`Setting tablet Mode to ${settings.get_boolean('tablet-mode')}`);
            }
            try {
              if (settings.get_boolean('tablet-mode')) {
                const proc = Gio.Subprocess.new(
                    ['bash', '-c', tablet_mode],
                    Gio.SubprocessFlags.STDOUT_SILENCE
                );
                this.checked = true;
              } else {
                const proc = Gio.Subprocess.new(
                    ['bash', '-c', laptop_mode],
                    Gio.SubprocessFlags.STDOUT_SILENCE
                );
                this.checked = false;
              }
            } catch (e) {
              logError(e);
            }
          }
        });
      }
    });

class SensorProxy {
  constructor(rotate_cb) {
    this._rotate_cb = rotate_cb;
    this._proxy = null;
    this._enabled = false;
    this._watcher_id = Gio.bus_watch_name(
      Gio.BusType.SYSTEM,
      'net.hadess.SensorProxy',
      Gio.BusNameWatcherFlags.NONE,
      this.appeared.bind(this),
      this.vanished.bind(this)
    );
  }

  destroy() {
    Gio.bus_unwatch_name(this._watcher_id);
    if (this._enabled) this.disable();
    this._proxy = null;
  }

  enable() {
    this._enabled = true;
    if (this._proxy === null) return;
    this._proxy.call_sync('ClaimAccelerometer', null, Gio.DBusCallFlags.NONE, -1, null);
  }

  disable() {
    this._enabled = false;
    if (this._proxy === null) return;
    this._proxy.call_sync('ReleaseAccelerometer', null, Gio.DBusCallFlags.NONE, -1, null);
  }

  appeared(connection, name, name_owner) {
    this._proxy = Gio.DBusProxy.new_for_bus_sync(
      Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
      'net.hadess.SensorProxy', '/net/hadess/SensorProxy', 'net.hadess.SensorProxy',
      null);
    this._proxy.connect('g-properties-changed', this.properties_changed.bind(this));
    if (this._enabled) {
      this._proxy.call_sync('ClaimAccelerometer', null, Gio.DBusCallFlags.NONE, -1, null);
    }
  }

  vanished(connection, name) {
    this._proxy = null;
  }

  properties_changed(proxy, changed, invalidated) {
    if (!this._enabled) return;
    let properties = changed.deep_unpack();
    for (let [name, value] of Object.entries(properties)) {
      if (name != 'AccelerometerOrientation') continue;
      let target = value.unpack();
      this._rotate_cb(target);
    }
  }
}

class ScreenAutorotate {
  constructor(settings) {
    this._system_actions = SystemActions.getDefault();
    this._settings = settings;
    this._system_actions_backup = null;
    this._override_system_actions();
    this._a11yApplicationsSettings = new Gio.Settings({schema_id: A11Y_APPLICATIONS_SCHEMA});
    this._orientation_settings = new Gio.Settings({ schema_id: ORIENTATION_LOCK_SCHEMA });
    this._orientation_settings.connect('changed::' + ORIENTATION_LOCK_KEY, this._orientation_lock_changed.bind(this));

    this._sensor_proxy = new SensorProxy(this.rotate_to.bind(this));

    this._state = false; // enabled or not

    let locked = this._orientation_settings.get_boolean(ORIENTATION_LOCK_KEY);
    if (!locked) this.enable();
  }

  _override_system_actions() {
    this._system_actions_backup = {
      '_updateOrientationLock': this._system_actions._updateOrientationLock
    };

    this._system_actions._updateOrientationLock = function() {
      this._actions.get('lock-orientation').available = true;
      this.notify('can-lock-orientation');
    };

    this._system_actions._updateOrientationLock();
  }

  _restore_system_actions() {
    if (this._system_actions_backup === null) return;
    this._system_actions._updateOrientationLock = this._system_actions_backup['_updateOrientationLock'];
    this._system_actions._updateOrientationLock();
    this._system_actions_backup = null;
  }

  _orientation_lock_changed() {
    let locked = this._orientation_settings.get_boolean(ORIENTATION_LOCK_KEY);
    if (this._state == locked) {
      this.toggle();
    }
  }

  destroy() {
    this._sensor_proxy.destroy();
    this._orientation_settings = null;
    this._a11yApplicationsSettings = null;
    this._restore_system_actions();
  }

  toggle() {
    if (this._state) {
      this.disable();
    } else {
      this.enable();
    }
  }
  enable() {
    this._originala11yKeyboardSetting = this._a11yApplicationsSettings.get_boolean(SHOW_KEYBOARD);
    this._sensor_proxy.enable();
    this._state = true;
  }

  disable() {
    this._a11yApplicationsSettings.set_boolean(SHOW_KEYBOARD, this._originala11yKeyboardSetting);
    this._originala11yKeyboardSetting = null;
    this._sensor_proxy.disable();
    this._state = false;
  }

  _handle_osk(target) {
    const landscapeOsk = this._settings.get_boolean('landscape-osk');
    const portraitRightOsk = this._settings.get_boolean('portrait-right-osk');
    const portraitLeftOsk = this._settings.get_boolean('portrait-left-osk');
    const landscapeFlippedOsk = this._settings.get_boolean('landscape-flipped-osk');
    switch (target) {
      case 0:
        this._a11yApplicationsSettings.set_boolean(SHOW_KEYBOARD, landscapeOsk);
        break;
      case 1:
        this._a11yApplicationsSettings.set_boolean(SHOW_KEYBOARD, portraitLeftOsk);
        break;
      case 2:
        this._a11yApplicationsSettings.set_boolean(SHOW_KEYBOARD, landscapeFlippedOsk);
        break;
      case 3:
        this._a11yApplicationsSettings.set_boolean(SHOW_KEYBOARD, portraitRightOsk);
        break;
    }
  }

  _handle_mode(target) {
    if (this._settings.get_boolean('sw-tablet-mode')) {
      switch (target) {
        case 0:
          this._settings.set_boolean('tablet-mode', false)
          break;
        case 1:
        case 2:
        case 3:
          this._settings.set_boolean('tablet-mode', true)
          break;
      }
    } else {
      this._settings.set_boolean('tablet-mode', false)
    }
  }

  rotate_to(orientation) {
    const sensor = Orientation[orientation];
    const invert_horizontal_direction = this._settings.get_boolean('invert-horizontal-rotation-direction');
    const invert_vertical_direction = this._settings.get_boolean('invert-vertical-rotation-direction');
    const offset = this._settings.get_int('orientation-offset');
    let target = sensor; // Default to sensor output.

    switch (sensor) {
      case 0:
        // sensor reports landscape
        if (invert_horizontal_direction) {
          target = 2;
        }
        break;
      case 1:
        // sensor reports portrait
        if (invert_vertical_direction) {
          target = 3;
        }
        break;
      case 2:
        // sensor reports landscape-inverted
        if (invert_horizontal_direction) {
          target = 0;
        }
        break;
      case 3:
        // sensor reports portrait-inverted
        if (invert_vertical_direction) {
          target = 1;
        }
        break;
    }

    target = (target + offset) % 4;
    if (this._settings.get_boolean('debug-logging')) {
      console.log(`SW_TABLET_MODE=${SW_TABLET_MODE}`);
      console.log(`sensor=${Orientation[orientation]}`);
      console.log(`offset=${offset}`);
      console.log(`target=${target}`);
    }
    Rotator.rotate_to(target);
    this._handle_osk(target);
    this._handle_mode(target);
  }
}

export default class ScreenAutoRotateExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._ext = new ScreenAutorotate(this._settings);

    this._settings.connect('changed::manual-flip', (settings, key) => {
      if (settings.get_boolean(key)) {
        this._add_manual_flip();
      } else {
        this._remove_manual_flip();
      }
    });

    this._settings.connect('changed::sw-tablet-mode', (settings, key) => {
      if (settings.get_boolean(key)) {
        this._add_manual_mode();
      } else {
        this._remove_manual_mode();
      }
    });

    this._settings.connect('changed::hide-lock-rotate', (settings, key) => {
      this._set_hide_lock_rotate(settings.get_boolean(key));
    });

    if (this._settings.get_boolean('sw-tablet-mode')) {
      this._add_manual_mode();
    } else {
      this._remove_manual_mode();
    }

    if (this._settings.get_boolean('manual-flip')) {
      this._add_manual_flip();
    } else {
      this._remove_manual_flip();
    }

    /* Timeout needed due to unknown race condition causing 'Auto Rotate'
    *  Quick Toggle to be undefined for a brief moment.
    */
    this._timeoutId = setTimeout(() => {
      this._set_hide_lock_rotate(this._settings.get_boolean('hide-lock-rotate'));
    }, 1000);
  }

  _set_hide_lock_rotate(state) {
    const autoRotateIndicator = Main.panel.statusArea.quickSettings._autoRotate;

    if (state) {
      Main.panel.statusArea.quickSettings._indicators.remove_child(autoRotateIndicator);
      Main.panel.statusArea.quickSettings.menu._grid.remove_child(autoRotateIndicator.quickSettingsItems[0]);
    } else {
      Main.panel.statusArea.quickSettings._indicators.add_child(autoRotateIndicator);
      Main.panel.statusArea.quickSettings._addItemsBefore(
        autoRotateIndicator.quickSettingsItems,
        Main.panel.statusArea.quickSettings._rfkill.quickSettingsItems[0]
      );
    }
  }

  _add_manual_mode() {
    this.modeIndicator = new ManualTabletModeIndicator(this._ext, this._settings);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this.modeIndicator);
  }

  _remove_manual_mode() {
    if (this.modeIndicator != null) {
      this.modeIndicator.destroy();
      this.modeIndicator = null;
    }
  }

  _add_manual_flip() {
    this.flipIndicator = new ManualOrientationIndicator(this._ext);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this.flipIndicator);
  }

  _remove_manual_flip() {
    if (this.flipIndicator != null) {
      this.flipIndicator.destroy();
      this.flipIndicator = null;
    }
  }

  disable() {
    /*
        Comment for unlock-dialog usage:
        The unlock-dialog session-mode is useful for this extension as it allows
        the user to rotate their screen or lock rotation after their device may
        have auto-locked. This provides the ability to log back in regardless of 
        the orientation of the device in tablet mode.
    */
    this._settings = null;
    clearTimeout(this._timeoutId);
    this._timeoutId = null;
    this._remove_manual_flip();
    this._ext.destroy();
    this._ext = null;
  }
}

