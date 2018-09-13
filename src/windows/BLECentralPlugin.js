/// <reference path="../../node_modules/@types/winrt-uwp/index.d.ts" />
/// <reference path="../../node_modules/@types/cordova/index.d.ts" />

//Includes
//var Enum = Windows.Devices.Enumeration; //Namespace of devices
var BT = Windows.Devices.Bluetooth; //Namespace of BT
var BTAdvert = Windows.Devices.Bluetooth.Advertisement;
var Radio = Windows.Devices.Radios;

//Locals Vars
var _advertWatcher = null; //BLE advertisement+device scanner
var _scanFunc = null; //Callback function
var _scanOptions = null;
var _scanServiceUuids = [];
var _scanning = false; //void to start the watcher again
var _addressHeader = ""; //left-part of the Win-BT addess
//Win-BT Adress: BluetoothLE#BluetoothLE[Local Device Address]-[Remote Device Address]
//Note: just-in-case variable

// For each detected peripheral, an instance of this class is maintained
/**
 * @typedef {Object} Peripheral - A Bluetooth LE device
 * @property {BT.BluetoothLEDevice} device - BluetoothLEDevice object
 * @property {number} address - Bluetooth address
 * @property {string} name - device name
 * @property {function} connectCallback - function called when device connects
 * @property {function} disconnectCallback - function called when device disconects
 */
var Peripheral = (function () {

    /**
     * Constructs a Peripheral object.
     * @param {number} address
     * @param {string} name
     */
    function Peripheral(address, name) {
        this.device = null;
        this.address = address;
        this.name = '';
        this.connectCallback = null;
        this.disconnectCallback = null;

        if (name) { this.name = name; }
    };

    /**
     * Tests whether the host is still connected to the device.
     */
    Peripheral.prototype.isConnected = function() {
        return this.device != null;
    };

    /**
     * Connect to the BluetoothLE device and keep track of its connection
     * status. disconnectCallback is expected to be a long-living function that
     * should be valid throughout the lifespan of the program so that abrupt
     * disconnections from the device (propagated by the stack) can be notified
     * to the application.
     *
     * @param {function} connectCallback
     * @param {function} disconnectCallback
     */
    Peripheral.prototype.connect = function(connectCallback, disconnectCallback) {
        console.log(`Connecting peripheral ${this.address}`);
        if (!this.device) {
            BT.BluetoothLEDevice.fromBluetoothAddressAsync(this.address)
            .done((dev) => {
                this.device = dev;
                this.connectCallback = connectCallback;
                this.disconnectCallback = disconnectCallback;
                this.connectCallback({
                    "name": this.name,
                    "id": this.address,
                    "advertising": [],
                    "rssi": 0,
                    "services": dev.gattServices,
                    "characteristics": []
                });
            }, err => {
                console.log('Error connecting to peripheral');
                disconnectCallback({
                    err: 'failied',
                    errorMessage: 'Failed to connect'
                });
            });
        }
    };
    return Peripheral;
}());

// Table of peripheral objects, keyed by their bluetooth address, which is
// a number.
var _peripherals = new Map(); // table of Peripheral objects, keyed by their BT address

//Publics functions
module.exports = {
    // args = [services, options, successWrapper]
    startScanWithOptions: function (success, failure, args) {
        console.log('BLE.startScanWithOptions');
        if (_advertWatcher) {
            failure("Scan is already in progress");
            return;
        }

        // clear unconnected peripherals
        for (let [addr, peripheral] of _peripherals) {
            if (!peripheral.isConnected()) {
                _peripherals.delete(addr);
            }
        }

        try {
            var filter = new BTAdvert.BluetoothLEAdvertisementFilter();
            var advert = new BTAdvert.BluetoothLEAdvertisement();
            filter.advertisement = advert;
            // This doesn't work on Windows
            // if (args[0]) {
            //     advert.serviceUuids = args[0];
            // }
            var advertWatcher = new BTAdvert.BluetoothLEAdvertisementWatcher(filter);
            var scanOptions = args[1];
            // TODO: allow scanning mode to be specified through options
            advertWatcher.scanningMode = BTAdvert.BluetoothLEScanningMode.active;
            advertWatcher.addEventListener("received", onAdvertReceived);
            advertWatcher.addEventListener("stopped", onAdvertStopped);
            // Save serviceUuids so that we can manually filter advertisement
            // packets.
            _scanServiceUuids = normalizeServiceIds(args[0]);
            _scanOptions = args[1];
            _scanFunc = args[2];
            advertWatcher.start();
            _advertWatcher = advertWatcher;
        } catch (e) {
            failure('Error initializing BluetoothLEAdvertWather');
        }
    },

    stopScan: function (success, failure, args) {
        console.log('BLE.stopScan');
        if (_advertWatcher) {
            _advertWatcher.stop();
            _advertWatcher = null;
            _scanFunc = null;
            _scanOptions = null;
            _scanServiceUuids = [];
        }
        success();
    },

    /**
     * Returns boolean indicating bluetooth radio status.
     * @returns {PromiseLike<boolean>}
     */
    isEnabled: function (success, failure, args) {
        BT.BluetoothAdapter.getDefaultAsync().done(adapter => {
            adapter.getRadioAsync().done(radio => {
                let state = radio.state;
                if (state == Radios.RadioState.on) {
                    success();
                } else {
                    failure();
                }
            }, err => {
                console.log('getRadioAsync failed, error: ', err);
                failure();
            });
        }, err => {
            console.log('getDefaultAsync failed, error: ', err);
            failure();
        });
    },

    /**
     * Bond a given device.
     * @param {number} args[0] - the device address to bond.
     */
    bond: function (success, failure, args) {
        var deviceId = args[0];
        console.log('BLE.bond, device: ', deviceId);
        failure('Not implemented');
    },

    /**
     * Unbond the given device.
     * @param {number} args[0] - the device address to unbond.
     */
    unbond: function (success, failure, args) {
        var deviceId = args[0];
        console.log('BLE.unbond, device: ', deviceId);
        failure('Not implemented');
    },

    /**
     * Returns a list of all bonded devices.
     */
    bondedDevices: function (success, failure, args) {
        console.log('BLE.bondedDevices');
        failure('Not implemented');
    },

    /**
     * Connect to a remote BluetoothLE device
     * @param {number} args[0]
     */
    connect: function (success, failure, args) {
        var deviceId = args[0];
        console.log('BLE.connect, device: ', deviceId);

        if (!_peripherals.get(deviceId)) {
            let peripheral = new Peripheral(deviceId);
            _peripherals.set(deviceId. peripheral)
        }

        /** @type {Peripheral} peripheral */
        let peripheral = _peripherals.get(deviceId);
        if (!peripheral.isConnected()) {
            peripheral.connect(success, failure);
        }
    },

    /**
     * Disconnect from the connected device.
     * @param {number} args[0]
     */
    disconnect: function (success, failure, args) {
        var deviceId = args[0];
        console.log('BLE.disconnect, device: ', deviceId);

        let peripheral = _peripherals.get(deviceId);
        if (!peripheral) {
            failure('Device not found');
            return;
        }

        /** @type {Peripheral} peripheral */
        if (peripheral.isConnected()) {
            peripheral.disconnect(success, failure);
        }
    },

    startNotification: function (success, failure, args) {
        var deviceId = args[0];
        var serviceId = args[1];
        var characteristicId = args[2];
        console.log('BLE.startNotification, device: ', deviceId, ', service: ', serviceId, ', characteristic: ', characteristicId);
        failure('Not implemented');
    },

    stopNotification: function (success, failure, args) {
        var deviceId = args[0];
        var serviceId = args[1];
        var characteristicId = args[2];
        console.log('BLE.stopNotification, device: ', deviceId, ', service: ', serviceId, ', characteristic: ', characteristicId);
        failure('Not implemented');
    },
    read: function (success, failure, args) {
        var deviceId = args[0];
        var serviceId = args[1];
        var characteristicId = args[2];
        console.log('BLE.read, device: ', deviceId, ', service: ', serviceId, ', characteristic: ', characteristicId);
        failure('Not implemented');
    },
    write: function (success, failure, args) {
        var deviceId = args[0];
        var serviceId = args[1];
        var characteristicId = args[2];
        console.log('BLE.write, device: ', deviceId, ', service: ', serviceId, ', characteristic: ', characteristicId);
        failure('Not implemented');
    }
}
// -- IMPLEMENTATION HELPERS --//

/**
 * Normalizes the user supplied serviceUudIds such that the only the
 * first 8 character segment is stored in our _serviceUuids global variable.
 * @param {string[]} serviceIds
 * @returns {string[]}
 */
function normalizeServiceIds(serviceIds) {
    let normalizedServiceIds = [];
    for (let index = 0; index < serviceIds.length; index++) {

        /** @type {string} */
        const serviceId = serviceIds[index].trim();
        /** @type {string} */
        let normalizedServiceId = '';
        if (serviceId.length < 8) {
            normalizedServiceId = "0".repeat(8-serviceId.length) + serviceId
        }
        normalizedServiceIds.push(normalizedServiceId.substr(0, 8));
    }
    return normalizedServiceIds;
}

 /**
  * Advertisement/scan result handler.
  * @param {BTAdvert.BluetoothLEAdvertisementReceivedEventArgs} advertArgs
  */
function onAdvertReceived(advertArgs) {
    console.log("BLE advertisement from " + advertArgs.bluetoothAddress + ", RSSI: " + advertArgs.rawSignalStrengthInDBm);
    let report = false;
    let found = false;
    if (_scanServiceUuids && _scanServiceUuids.length > 0) {
        // search if any of the serviceUuids specified in the startScanWithOptions
        // method is present in the serviceUudis list of the advert packet.
        for (let index = 0; index < _scanServiceUuids.length; index++) {
            const serviceUuid = _scanServiceUuids[index];
            for (let serviceIndex = 0; serviceIndex < advertArgs.advertisement.serviceUuids.size; serviceIndex++) {
                const element = advertArgs.advertisement.serviceUuids.getAt(serviceIndex);
                if (element.startsWith(serviceUuid)) {
                    found = true;
                    break;
                }
            }
        }
    } else {
        found = true;
    }
    if (!_peripherals.get(advertArgs.bluetoothAddress)) {
        report = true;
        _peripherals.set(advertArgs.bluetoothAddress, new Peripheral(
            advertArgs.bluetoothAddress,
            advertArgs.advertisement.localName
            )
        )
    } else {
        if (_scanOptions.reportDuplicates) {
            report = true;
        }
    }

    if ( _scanFunc && report) {
        _scanFunc({
            "name": advertArgs.advertisement.localName,
            "id": advertArgs.bluetoothAddress,
            "rssi": advertArgs.rawSignalStrengthInDBm,
            "services": advertArgs.advertisement.serviceUuids,
            "advertising": advertArgs.advertisement.dataSections
        });
    }
}

/**
 * Advertisement/scan stopped event handler
 * @param {BTAdvert.BluetoothLEAdvertisementWatcherStoppedEventArgs} stoppedArgs
 */
function onAdvertStopped(stoppedArgs) {
    console.log('BLEAdvertWatcher stopped');
    _advertWatcher = null;
}

/**
 * Peripheral connection status change notification handler
 * @param {BT.BluetoothLEDevice} device
 */
function onConnectionStatusChange(device) {
    /** @type {Peripheral} */
    let peripheral = _peripherals.get(device.bluetoothAddress);
    if (peripheral) {
        let status = device.connectionStatus;
        if (status == BT.BluetoothConnectionStatus.connected) {

        } else {

        }
    }
}

cordova.require("cordova/exec/proxy").add("BLE", module.exports);
